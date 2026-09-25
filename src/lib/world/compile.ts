import type { StoryBible, ContinuityEntry, LanguagePolicy, SceneTemplate } from "./schemas";

export interface CompiledContext {
  systemPrompt: string;
  sceneContext: string;
}

export interface CompileOptions {
  /**
   * Every scene id, in the order the Story Diagram's green links place them. The
   * outline is written in this order, so the model is told where the scene it is
   * writing sits in the plot. Left out, the scenes are read in World → Scenes
   * order instead.
   */
  sceneOrder?: string[];
  /**
   * Set when the writer has already been sent a draft and is now asking for a
   * change, so the scene is rewritten rather than begun.
   */
  revising?: boolean;
}

/**
 * Turns the writer's language policy into instructions for the model. Returns
 * an empty string when the policy is off or carries nothing to enforce, so
 * callers can skip adding a section or a system message.
 */
export function compileLanguagePolicy(policy: LanguagePolicy): string {
  if (!policy.enabled) return "";

  const parts: string[] = [];
  const language = policy.language.trim();
  const genre = policy.genre.trim();
  const subgenre = policy.subgenre.trim();
  const rules = policy.rules.trim();

  if (language) parts.push(`Write all output in ${language}.`);
  if (genre) parts.push(`Write in the ${genre} form.`);
  if (subgenre) parts.push(`Keep it within the ${subgenre} subgenre.`);
  if (rules) {
    parts.push(
      `Follow these grammar, punctuation and spelling rules without exception:\n${rules}`,
    );
  }

  if (parts.length === 0) return "";
  return `## LANGUAGE POLICY\n${parts.join("\n\n")}`;
}

export function compileStoryContext(
  bible: StoryBible,
  sceneId: string,
  previousScenes: ContinuityEntry[],
  options: CompileOptions = {},
): CompiledContext {
  const scene = bible.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`Scene ${sceneId} not found`);

  const hardRules = bible.worldHardRules
    .map((r) => `[${r.category}] ${r.rule}\n  -> violation: ${r.violationConsequence}`)
    .join("\n");

  const softRules = bible.worldSoftRules
    .map((r) => `- ${r.rule}${r.conditions?.length ? ` (conditions: ${r.conditions.join(", ")})` : ""}`)
    .join("\n");

  const n = bible.narrativeRules;
  const languagePolicy = compileLanguagePolicy(bible.languagePolicy);
  const systemPrompt = `
You are a narrator and co-author of a novel. Generate text STRICTLY according
to the WORLD BIBLE and NARRATIVE RULES below. Do not change facts,
relationships, or character traits without explicit consent.

The STORY OUTLINE lists every scene of the story in order. The one marked
"THIS SCENE" is the scene being written: what comes before it has already
happened and must not be contradicted, and what comes after it must still be
possible when this scene ends. End the scene on the consequence its plan calls
for.

## HARD WORLD RULES (never violate)
${hardRules || "(none)"}

## SOFT WORLD RULES (may bend with justification)
${softRules || "(none)"}

## NARRATIVE RULES
- POV: ${n.pov}
- Tense: ${n.tense}
- Tone: ${n.tone}
- Pacing: ${n.pacing}
- Scene length: ${n.sceneLengthWords.min}-${n.sceneLengthWords.max} words
- Dialogue ratio: ${n.dialogueRatio}
- Show, don't tell: ${n.showDontTell}
- Forbidden tropes: ${n.forbiddenTropes.join(", ") || "(none)"}
${languagePolicy ? `\n${languagePolicy}\n` : ""}
## RESPONSE FORMAT
Return ONLY a JSON object with this shape:
{
  "prose": "scene text",
  "factsEstablished": ["fact 1", "fact 2"],
  "relationshipChanges": [
    { "from": "name", "to": "name", "newState": "desc", "reason": "why" }
  ],
  "newElementsIntroduced": ["new element"]
}
No text outside the JSON. When a draft has already been sent and the writer is
now asking for a change, return the WHOLE scene again in this shape — revised as
asked, not only the lines that changed.
`.trim();

  const sceneCharacters = bible.characters.filter((c) =>
    scene.characterIds.includes(c.id),
  );

  const characterBlock = sceneCharacters
    .map((c) => `
[${c.name}]${c.aliases?.length ? ` (aka ${c.aliases.join(", ")})` : ""}
- Appearance: ${c.appearance}
- Traits: ${c.traits.join(", ")}
- Motivation: ${c.motivation}
- Fear: ${c.fear}
- Speech style: ${c.speechStyle}
${c.arc ? `- Arc: ${c.arc.from} -> ${c.arc.to}` : ""}
${c.secret ? `- SECRET (do not reveal explicitly): ${c.secret}` : ""}
`)
    .join("\n");

  const relationships = bible.relationships
    .filter(
      (r) =>
        scene.characterIds.includes(r.fromId) &&
        scene.characterIds.includes(r.toId),
    )
    .map((r) => {
      const from = bible.characters.find((c) => c.id === r.fromId)?.name ?? r.fromId;
      const to = bible.characters.find((c) => c.id === r.toId)?.name ?? r.toId;
      return `- ${from} -> ${to}: ${r.type} (${r.intensity}/10). ${r.currentState}`;
    })
    .join("\n");

  const recentSummary = previousScenes
    .slice(-3)
    .map((p) => `[${p.sceneId}] ${p.summary}`)
    .join("\n");

  const allFacts = bible.continuityLog
    .flatMap((c) => c.facts)
    .slice(-30)
    .map((f) => `- ${f}`)
    .join("\n");

  // Where this scene sits in the story. The Story Diagram's green links put the
  // scenes in order, so the writer's own map is read back as the plot: every
  // scene with what it sets out to do and what it leaves behind, and the one
  // being written marked. The model then knows what has already happened and
  // what this scene has to set up — not only what happens inside it.
  const order = options.sceneOrder?.length
    ? options.sceneOrder
    : bible.scenes.map((candidate) => candidate.id);
  const outline = order
    .map((id) => bible.scenes.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is SceneTemplate => candidate !== undefined)
    .map((candidate, index) => {
      const mark = candidate.id === sceneId ? "  <- THIS SCENE" : "";
      return `${index + 1}. ${candidate.title.trim() || "(untitled scene)"}${mark}
   Goal: ${candidate.goal || "(none)"}
   Conflict: ${candidate.conflict || "(none)"}
   Turning point: ${candidate.turningPoint || "(none)"}
   Consequence: ${candidate.consequence || "(none)"}`;
    })
    .join("\n");

  const sceneContext = `
## CHARACTERS IN THIS SCENE
${characterBlock || "(none)"}

## RELATIONSHIPS IN THIS SCENE
${relationships || "(none)"}

## SCENE PLAN
- Title: ${scene.title}
- Goal: ${scene.goal}
- Location: ${scene.location}
- Time: ${scene.time}
- Conflict: ${scene.conflict}
- Turning point: ${scene.turningPoint}
- Consequence: ${scene.consequence}

## STORY OUTLINE (every scene, in story order)
${outline || "(none)"}

## PREVIOUS SCENES SUMMARY
${recentSummary || "(none - first scene)"}

## ESTABLISHED FACTS (do not contradict)
${allFacts || "(none)"}

## TASK
${
  options.revising
    ? "The writer's instructions follow. Rewrite the whole scene to carry them out, keeping everything else that was already right."
    : "Write the scene described above, in full."
}
`.trim();

  return { systemPrompt, sceneContext };
}
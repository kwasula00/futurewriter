import type { StoryBible, ContinuityEntry, LanguagePolicy } from "./schemas";

export interface CompiledContext {
  systemPrompt: string;
  sceneContext: string;
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
No text outside the JSON.
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

## PREVIOUS SCENES SUMMARY
${recentSummary || "(none - first scene)"}

## ESTABLISHED FACTS (do not contradict)
${allFacts || "(none)"}
`.trim();

  return { systemPrompt, sceneContext };
}
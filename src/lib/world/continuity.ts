import type { SceneOutput, StoryBible } from "./schemas";

export function applyContinuity(
  bible: StoryBible,
  sceneId: string,
  output: SceneOutput,
): StoryBible {
  const next = structuredClone(bible);
  next.continuityLog.push({
    sceneId,
    summary: output.prose.slice(0, 300),
    facts: output.factsEstablished,
    relationshipChanges: output.relationshipChanges,
    newElements: output.newElementsIntroduced,
    timestamp: Date.now(),
  });

  const nameToId = new Map(next.characters.map((c) => [c.name, c.id]));
  for (const ch of output.relationshipChanges) {
    const fromId = nameToId.get(ch.from);
    const toId = nameToId.get(ch.to);
    if (!fromId || !toId) continue;
    const rel = next.relationships.find(
      (r) => r.fromId === fromId && r.toId === toId,
    );
    if (rel) rel.currentState = ch.newState;
  }

  return next;
}
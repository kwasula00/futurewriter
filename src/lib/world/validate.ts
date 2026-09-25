import type { SceneOutput, StoryBible } from "./schemas";

export interface ValidationIssue {
  type: "hard_rule_violation" | "relationship_inconsistency"
      | "character_contradiction" | "new_element";
  message: string;
  severity: "error" | "warning";
}

export function validateSceneAgainstBible(
  scene: SceneOutput,
  bible: StoryBible,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const proseLower = scene.prose.toLowerCase();

  for (const rule of bible.worldHardRules) {
    const keywords = rule.rule.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const hits = keywords.filter((k) => proseLower.includes(k));
    if (hits.length >= 3) {
      issues.push({
        type: "hard_rule_violation",
        message: `Possible hard-rule violation "${rule.rule}" (hits: ${hits.join(", ")})`,
        severity: "warning",
      });
    }
  }

  const nameToId = new Map(bible.characters.map((c) => [c.name, c.id]));
  for (const change of scene.relationshipChanges) {
    const fromId = nameToId.get(change.from);
    const toId = nameToId.get(change.to);
    if (!fromId || !toId) {
      issues.push({
        type: "character_contradiction",
        message: `Unknown character in relationship change: ${change.from} -> ${change.to}`,
        severity: "error",
      });
      continue;
    }
    const exists = bible.relationships.some(
      (r) => r.fromId === fromId && r.toId === toId,
    );
    if (!exists) {
      issues.push({
        type: "relationship_inconsistency",
        message: `Relationship ${change.from} -> ${change.to} not in world bible`,
        severity: "warning",
      });
    }
  }

  for (const el of scene.newElementsIntroduced) {
    issues.push({
      type: "new_element",
      message: `New world element needs confirmation: ${el}`,
      severity: "warning",
    });
  }

  return issues;
}
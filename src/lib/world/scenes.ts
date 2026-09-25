import type { SceneTemplate } from "./schemas";

/** Ids are random, so a fresh scene stands on its own from the first moment. */
function newSceneId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * A copy of a scene: every element is kept, the copy is given an id of its own
 * so the two scenes can be told apart and edited apart, and it becomes a child
 * of the scene it was copied from. It is named `copy-<n>`, numbered among the
 * copies already made of that scene, so the children of one scene stay distinct.
 */
export function copyScene(scene: SceneTemplate, scenes: SceneTemplate[]): SceneTemplate {
  const taken = new Set(scenes.map((sibling) => sibling.title));
  let n = scenes.filter((sibling) => sibling.parentId === scene.id).length + 1;
  while (taken.has(`copy-${n}`)) n += 1;

  return {
    ...scene,
    id: newSceneId(),
    title: `copy-${n}`,
    parentId: scene.id,
    characterIds: [...scene.characterIds],
  };
}

/** A scene together with how deep it sits under its parent scene. */
export type SceneTreeEntry = { scene: SceneTemplate; depth: number };

/**
 * The scenes in reading order: a scene stands before the copies made of it, and
 * those copies before the copies made of them. A scene whose parent is gone is
 * shown on its own rather than being lost.
 */
export function orderScenes(scenes: SceneTemplate[]): SceneTreeEntry[] {
  const ids = new Set(scenes.map((scene) => scene.id));
  const children = new Map<string, SceneTemplate[]>();
  const roots: SceneTemplate[] = [];

  for (const scene of scenes) {
    if (scene.parentId && ids.has(scene.parentId)) {
      const list = children.get(scene.parentId) ?? [];
      list.push(scene);
      children.set(scene.parentId, list);
    } else {
      roots.push(scene);
    }
  }

  const ordered: SceneTreeEntry[] = [];
  const walk = (scene: SceneTemplate, depth: number) => {
    ordered.push({ scene, depth });
    for (const child of children.get(scene.id) ?? []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);

  return ordered;
}

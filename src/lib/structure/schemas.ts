import { z } from "zod";

/**
 * The structural roles a written work can be assembled from. Every role maps to
 * one heading in the single continuous draft.
 */
export const STRUCTURE_KINDS = [
  "title",
  "subtitle",
  "dedication",
  "foreword",
  "introduction",
  "prologue",
  "part",
  "chapter",
  "subchapter",
  "scene",
  "poem",
  "section",
  "interlude",
  "epilogue",
  "conclusion",
  "afterword",
  "acknowledgments",
  "appendix",
  "notes",
  "bibliography",
] as const;

export const StructureKindSchema = z.enum(STRUCTURE_KINDS);
export type StructureKind = z.infer<typeof StructureKindSchema>;

/** Display name of a role, plus the draft heading level it is rendered at. */
export const KIND_META: Record<StructureKind, { label: string; heading: 1 | 2 | 3 }> = {
  title: { label: "Title", heading: 1 },
  subtitle: { label: "Subtitle", heading: 2 },
  dedication: { label: "Dedication", heading: 2 },
  foreword: { label: "Foreword", heading: 2 },
  introduction: { label: "Introduction", heading: 2 },
  prologue: { label: "Prologue", heading: 2 },
  part: { label: "Part", heading: 1 },
  chapter: { label: "Chapter", heading: 2 },
  subchapter: { label: "Subchapter", heading: 3 },
  scene: { label: "Scene", heading: 3 },
  poem: { label: "Poem", heading: 3 },
  section: { label: "Section", heading: 3 },
  interlude: { label: "Interlude", heading: 2 },
  epilogue: { label: "Epilogue", heading: 2 },
  conclusion: { label: "Conclusion", heading: 2 },
  afterword: { label: "Afterword", heading: 2 },
  acknowledgments: { label: "Acknowledgments", heading: 2 },
  appendix: { label: "Appendix", heading: 2 },
  notes: { label: "Notes", heading: 2 },
  bibliography: { label: "Bibliography", heading: 2 },
};

/** Roles that read as a single element, so a new one is not numbered. */
const UNNUMBERED_KINDS: StructureKind[] = [
  "title",
  "subtitle",
  "dedication",
  "foreword",
  "introduction",
  "prologue",
  "interlude",
  "epilogue",
  "conclusion",
  "afterword",
  "acknowledgments",
  "appendix",
  "notes",
  "bibliography",
];

/** The role a nested element gets when it is added inside a container role. */
export const CHILD_KINDS: Partial<Record<StructureKind, StructureKind>> = {
  part: "scene",
  chapter: "subchapter",
  subchapter: "scene",
};

/**
 * Roles the writer can name with text of their own instead of a generated
 * label, so an element of this kind is added with custom text.
 */
export const CUSTOM_TEXT_KINDS: StructureKind[] = ["title", "subtitle", "chapter"];

/** Roles that are nothing but that text, so it cannot be left empty. */
export const REQUIRED_TEXT_KINDS: StructureKind[] = ["title", "subtitle"];

/** The kinds of writing a project can be, each with the roles it is built from. */
export const WORK_TYPES = [
  "novel",
  "novella",
  "short_story",
  "essay",
  "poetry",
  "nonfiction",
  "memoir",
  "drama",
] as const;

export const WorkTypeSchema = z.enum(WORK_TYPES);
export type WorkType = z.infer<typeof WorkTypeSchema>;

export const WORK_TYPE_META: Record<WorkType, { label: string; kinds: StructureKind[] }> = {
  novel: {
    label: "Novel",
    kinds: [
      "title", "subtitle", "dedication", "foreword", "introduction", "prologue", "part", "chapter",
      "subchapter", "scene", "interlude", "epilogue", "conclusion", "afterword",
      "acknowledgments",
    ],
  },
  novella: {
    label: "Novella",
    kinds: [
      "title", "subtitle", "dedication", "chapter", "subchapter", "scene", "interlude", "conclusion",
      "afterword",
    ],
  },
  short_story: {
    label: "Short story",
    kinds: ["title", "subtitle", "scene", "section", "interlude"],
  },
  essay: {
    label: "Essay",
    kinds: ["title", "subtitle", "introduction", "section", "conclusion", "notes", "bibliography"],
  },
  poetry: {
    label: "Poetry",
    kinds: ["title", "subtitle", "dedication", "foreword", "poem", "section", "notes", "afterword"],
  },
  nonfiction: {
    label: "Nonfiction",
    kinds: [
      "title", "subtitle", "foreword", "introduction", "part", "chapter", "section", "conclusion",
      "appendix", "notes", "bibliography",
    ],
  },
  memoir: {
    label: "Memoir",
    kinds: [
      "title", "subtitle", "dedication", "foreword", "introduction", "part", "chapter", "interlude",
      "epilogue", "afterword", "acknowledgments",
    ],
  },
  drama: {
    label: "Drama",
    kinds: ["title", "subtitle", "prologue", "part", "scene", "interlude", "epilogue"],
  },
};

/**
 * One element of the outline. Nesting is a parent reference rather than a tree
 * of children, so the whole outline stays a flat list that is easy to edit and
 * is stored in the same order the headings appear in the draft.
 */
export const StructureNodeSchema = z.object({
  id: z.string(),
  kind: StructureKindSchema,
  title: z.string(),
  parentId: z.string().nullable(),
});
export type StructureNode = z.infer<typeof StructureNodeSchema>;

export const StructureSchema = z.object({
  version: z.number().default(1),
  nodes: z.array(StructureNodeSchema),
});
export type Structure = z.infer<typeof StructureSchema>;

export const emptyStructure: Structure = { version: 1, nodes: [] };

/** The title a freshly added element starts with. */
export function defaultNodeTitle(
  kind: StructureKind,
  nodes: StructureNode[],
  parentId: string | null,
): string {
  const label = KIND_META[kind].label;
  if (UNNUMBERED_KINDS.includes(kind)) return label;
  const siblings = nodes.filter((node) => node.kind === kind && node.parentId === parentId).length;
  return `${label} ${siblings + 1}`;
}

/** A node id that is unique within the outline. */
export function newNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

/** The ids of every element nested under one, at any depth. */
export function descendantIds(nodes: StructureNode[], id: string): string[] {
  const children = nodes.filter((node) => node.parentId === id);
  return children.flatMap((child) => [child.id, ...descendantIds(nodes, child.id)]);
}

/** Which way an element travels among the elements it shares a parent with. */
export type MoveDirection = "up" | "down";

/**
 * Swaps an element with the neighbour it shares a parent with. The list is
 * rebuilt depth first, so it keeps reading in the order the draft does and an
 * element still travels with everything nested inside it. The list is returned
 * untouched when the element is already first or last among its siblings.
 */
export function moveNode(
  nodes: StructureNode[],
  id: string,
  direction: MoveDirection,
): StructureNode[] {
  const byParent = new Map<string | null, StructureNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }

  const node = nodes.find((entry) => entry.id === id);
  if (!node) return nodes;

  const siblings = byParent.get(node.parentId) ?? [];
  const index = siblings.indexOf(node);
  const neighbour = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || neighbour < 0 || neighbour >= siblings.length) return nodes;

  [siblings[index], siblings[neighbour]] = [siblings[neighbour], siblings[index]];

  const ordered: StructureNode[] = [];
  const walk = (parentId: string | null) => {
    for (const child of byParent.get(parentId) ?? []) {
      ordered.push(child);
      walk(child.id);
    }
  };
  walk(null);
  return ordered;
}

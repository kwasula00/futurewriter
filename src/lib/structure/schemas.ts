import { z } from "zod";

/**
 * The structural roles a written work can be assembled from. Every role maps to
 * one heading in the single continuous draft.
 */
export const STRUCTURE_KINDS = [
  "title",
  "subtitle",
  "dedication",
  "epigraph",
  "table_of_contents",
  "foreword",
  "preface",
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
  "glossary",
  "notes",
  "bibliography",
  "index",
  "about_author",
] as const;

export const StructureKindSchema = z.enum(STRUCTURE_KINDS);
export type StructureKind = z.infer<typeof StructureKindSchema>;

/** Display name of a role, plus the draft heading level it is rendered at. */
export const KIND_META: Record<StructureKind, { label: string; heading: 1 | 2 | 3 | 4 }> = {
  title: { label: "Title", heading: 1 },
  subtitle: { label: "Subtitle", heading: 2 },
  dedication: { label: "Dedication", heading: 2 },
  epigraph: { label: "Epigraph", heading: 2 },
  table_of_contents: { label: "Table of Contents", heading: 2 },
  foreword: { label: "Foreword", heading: 2 },
  preface: { label: "Preface", heading: 2 },
  introduction: { label: "Introduction", heading: 2 },
  prologue: { label: "Prologue", heading: 2 },
  part: { label: "Part", heading: 1 },
  chapter: { label: "Chapter", heading: 2 },
  subchapter: { label: "Subchapter", heading: 3 },
  scene: { label: "Scene", heading: 3 },
  poem: { label: "Poem", heading: 3 },
  section: { label: "Section", heading: 4 },
  interlude: { label: "Interlude", heading: 2 },
  epilogue: { label: "Epilogue", heading: 2 },
  conclusion: { label: "Conclusion", heading: 2 },
  afterword: { label: "Afterword", heading: 2 },
  acknowledgments: { label: "Acknowledgments", heading: 2 },
  appendix: { label: "Appendix", heading: 2 },
  glossary: { label: "Glossary", heading: 2 },
  notes: { label: "Notes", heading: 2 },
  bibliography: { label: "Bibliography", heading: 2 },
  index: { label: "Index", heading: 2 },
  about_author: { label: "About the Author", heading: 2 },
};

/**
 * The roles a nested element may get when it is added inside a container role.
 * A container can hold more than one kind of child, so the writer chooses.
 */
export const CHILD_KINDS: Partial<Record<StructureKind, StructureKind[]>> = {
  part: ["chapter", "scene"],
  chapter: ["subchapter", "section"],
  subchapter: ["section"],
  foreword: ["section"],
  preface: ["section"],
  introduction: ["section"],
  conclusion: ["section"],
  afterword: ["section"],
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
      "title", "subtitle", "dedication", "epigraph", "table_of_contents", "foreword", "preface",
      "introduction", "prologue", "part", "chapter", "subchapter", "scene", "section", "interlude",
      "epilogue", "conclusion", "afterword", "acknowledgments", "appendix", "glossary", "notes",
      "bibliography", "index", "about_author",
    ],
  },
  novella: {
    label: "Novella",
    kinds: [
      "title", "subtitle", "dedication", "epigraph", "table_of_contents", "chapter", "subchapter",
      "scene", "section", "interlude", "conclusion", "afterword", "about_author",
    ],
  },
  short_story: {
    label: "Short story",
    kinds: ["title", "subtitle", "epigraph", "scene", "section", "interlude"],
  },
  essay: {
    label: "Essay",
    kinds: [
      "title", "subtitle", "epigraph", "introduction", "section", "conclusion", "notes",
      "bibliography", "about_author",
    ],
  },
  poetry: {
    label: "Poetry",
    kinds: [
      "title", "subtitle", "dedication", "epigraph", "foreword", "preface", "poem", "section",
      "notes", "afterword", "about_author",
    ],
  },
  nonfiction: {
    label: "Nonfiction",
    kinds: [
      "title", "subtitle", "epigraph", "table_of_contents", "foreword", "preface", "introduction",
      "part", "chapter", "subchapter", "section", "conclusion", "appendix", "glossary", "index",
      "notes", "bibliography", "about_author",
    ],
  },
  memoir: {
    label: "Memoir",
    kinds: [
      "title", "subtitle", "dedication", "epigraph", "foreword", "preface", "introduction", "part",
      "chapter", "subchapter", "section", "interlude", "epilogue", "afterword", "acknowledgments",
      "about_author",
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

/**
 * The base title a freshly added element starts with. Numbered roles start
 * empty, because their number and label are derived from the tree afterwards.
 */
export function defaultNodeTitle(kind: StructureKind): string {
  if (isNumberedKind(kind)) return "";
  return KIND_META[kind].label;
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

/**
 * Every element in the order the draft reads it: depth first, each element
 * before the ones nested inside it. The stored list is a flat one that a new
 * child is appended to, so anything that shows the outline has to walk the
 * tree to get the nesting right.
 */
export function outlineOrder(
  nodes: StructureNode[],
): { node: StructureNode; depth: number }[] {
  const byParent = new Map<string | null, StructureNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }

  const ordered: { node: StructureNode; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      ordered.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return ordered;
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

/** Roles whose label carries a number that is derived from their place in the
 *  tree, rather than a number the writer types into the title. */
const NUMBERED_KINDS: StructureKind[] = [
  "chapter",
  "subchapter",
  "section",
  "poem",
  "scene",
  "appendix",
];

export function isNumberedKind(kind: StructureKind): boolean {
  return NUMBERED_KINDS.includes(kind);
}

/**
 * Roles that may only sit at one end of the book: the prologue opens it, before
 * the first chapter, and the epilogue closes it, after the last chapter. They
 * are single, unnumbered elements, so they do not travel like the rest.
 */
const POSITION_LOCKED_KINDS: StructureKind[] = ["prologue", "epilogue"];

export function isPositionLocked(kind: StructureKind): boolean {
  return POSITION_LOCKED_KINDS.includes(kind);
}

/** The numbering a role keeps once it is stripped from a stored title. */
const NUMBER_PREFIX: Partial<Record<StructureKind, RegExp>> = {
  chapter: /^Chapter\s+[0-9]+\s*[:.–-]?\s*/i,
  poem: /^Poem\s+[0-9]+\s*[:.–-]?\s*/i,
  scene: /^Scene\s+[0-9]+\s*[:.–-]?\s*/i,
  appendix: /^Appendix\s+[A-Z]\s*[:.–-]?\s*/i,
  subchapter: /^(?:[0-9]+(?:\.[0-9]+)*|Subchapter\s+\S+)\s*[:.–-]?\s*/i,
  section: /^(?:[0-9]+(?:\.[0-9]+)*|Section\s+\S+)\s*[:.–-]?\s*/i,
};

/** The writer's own words in a title, with any derived numbering taken off. */
function stripNumbering(kind: StructureKind, title: string): string {
  const pattern = NUMBER_PREFIX[kind];
  return pattern ? title.replace(pattern, "").trim() : title;
}

/** A numbered title, rebuilt from its derived number and the writer's words. */
function numberedTitle(kind: StructureKind, number: string, remainder: string): string {
  if (kind === "subchapter" || kind === "section") {
    return remainder ? `${number} ${remainder}` : number;
  }
  const prefix =
    kind === "chapter"
      ? `Chapter ${number}`
      : kind === "poem"
        ? `Poem ${number}`
        : kind === "scene"
          ? `Scene ${number}`
          : kind === "appendix"
            ? `Appendix ${number}`
            : `${KIND_META[kind].label} ${number}`;
  return remainder ? `${prefix}: ${remainder}` : prefix;
}

/**
 * Rewrites the derived titles of every numbered element so they match the tree.
 * Chapters read "Chapter 1", subchapters "1.1", sections "1.1.1" and appendices
 * "Appendix A", each following its parent, so adding or removing one renumbers
 * everything after it on its own. The writer's own words in a title survive.
 */
export function renumberTitles(nodes: StructureNode[]): StructureNode[] {
  const counters = new Map<string, number>();
  const chapterOf = new Map<string, number>();
  const subOf = new Map<string, string>();

  return nodes.map((node) => {
    if (!isNumberedKind(node.kind)) return node;

    const bucket = `${node.kind}:${node.parentId ?? "root"}`;
    const index = (counters.get(bucket) ?? 0) + 1;
    counters.set(bucket, index);

    let number: string;
    if (node.kind === "chapter") {
      number = String(index);
      chapterOf.set(node.id, index);
    } else if (node.kind === "subchapter") {
      const chapter = node.parentId ? chapterOf.get(node.parentId) : undefined;
      number = chapter ? `${chapter}.${index}` : String(index);
      subOf.set(node.id, number);
    } else if (node.kind === "section") {
      const sub = node.parentId ? subOf.get(node.parentId) : undefined;
      const chapter = node.parentId ? chapterOf.get(node.parentId) : undefined;
      number = sub ? `${sub}.${index}` : chapter ? `${chapter}.${index}` : String(index);
    } else if (node.kind === "appendix") {
      number = String.fromCharCode(64 + Math.min(index, 26));
    } else {
      number = String(index);
    }

    return { ...node, title: numberedTitle(node.kind, number, stripNumbering(node.kind, node.title)) };
  });
}

/** The titles that changed between two outlines, so the draft can follow. */
export function changedTitles(
  before: StructureNode[],
  after: StructureNode[],
): { id: string; title: string }[] {
  const prior = new Map(before.map((node) => [node.id, node.title]));
  return after
    .filter((node) => prior.get(node.id) !== node.title)
    .map((node) => ({ id: node.id, title: node.title }));
}

/**
 * Puts a new top-level element where its role is allowed to sit: the prologue
 * goes in front of the first chapter, everything else is appended, which keeps
 * the epilogue after the last chapter.
 */
export function insertRootNode(nodes: StructureNode[], node: StructureNode): StructureNode[] {
  if (node.kind === "prologue") {
    const at = nodes.findIndex((entry) => entry.kind === "chapter");
    const index = at === -1 ? 0 : at;
    return [...nodes.slice(0, index), node, ...nodes.slice(index)];
  }
  return [...nodes, node];
}

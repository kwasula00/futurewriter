import {
  KIND_META,
  newNodeId,
  type Structure,
  type StructureKind,
  type StructureNode,
  type WorkType,
} from "@/lib/structure/schemas";

/** One element of a preset skeleton, with the elements nested inside it. */
type PresetNode = {
  kind: StructureKind;
  title: string;
  children?: PresetNode[];
};

/**
 * The skeleton each work type starts from. The writer picks a type and gets a
 * construction that already matches how that kind of work is put together.
 */
export const STRUCTURE_PRESETS: Record<WorkType, PresetNode[]> = {
  novel: [
    { kind: "dedication", title: "Dedication" },
    { kind: "introduction", title: "Introduction" },
    { kind: "chapter", title: "Chapter 1" },
    { kind: "chapter", title: "Chapter 2" },
    { kind: "chapter", title: "Chapter 3" },
    { kind: "conclusion", title: "Conclusion" },
  ],
  novella: [
    { kind: "dedication", title: "Dedication" },
    { kind: "chapter", title: "Chapter 1" },
    { kind: "chapter", title: "Chapter 2" },
    { kind: "conclusion", title: "Conclusion" },
  ],
  short_story: [
    { kind: "scene", title: "Scene 1" },
    { kind: "scene", title: "Scene 2" },
    { kind: "scene", title: "Scene 3" },
  ],
  essay: [
    { kind: "introduction", title: "Introduction" },
    { kind: "section", title: "Thesis" },
    { kind: "section", title: "Argument 1" },
    { kind: "section", title: "Argument 2" },
    { kind: "conclusion", title: "Conclusion" },
  ],
  poetry: [
    { kind: "dedication", title: "Dedication" },
    { kind: "poem", title: "Poem 1" },
    { kind: "poem", title: "Poem 2" },
    { kind: "poem", title: "Poem 3" },
    { kind: "poem", title: "Poem 4" },
    { kind: "notes", title: "Notes" },
  ],
  nonfiction: [
    { kind: "introduction", title: "Introduction" },
    { kind: "chapter", title: "Chapter 1" },
    { kind: "chapter", title: "Chapter 2" },
    { kind: "chapter", title: "Chapter 3" },
    { kind: "bibliography", title: "Bibliography" },
  ],
  memoir: [
    { kind: "dedication", title: "Dedication" },
    { kind: "chapter", title: "Chapter 1" },
    { kind: "chapter", title: "Chapter 2" },
    { kind: "chapter", title: "Chapter 3" },
    { kind: "afterword", title: "Afterword" },
  ],
  drama: [
    { kind: "prologue", title: "Prologue" },
    {
      kind: "part",
      title: "Act I",
      children: [
        { kind: "scene", title: "Scene 1" },
        { kind: "scene", title: "Scene 2" },
      ],
    },
    {
      kind: "part",
      title: "Act II",
      children: [
        { kind: "scene", title: "Scene 1" },
        { kind: "scene", title: "Scene 2" },
      ],
    },
    { kind: "epilogue", title: "Epilogue" },
  ],
};

/** Builds a fresh outline from the preset of a work type, with new ids. */
export function createPresetStructure(workType: WorkType): Structure {
  const nodes: StructureNode[] = [];

  const append = (presets: PresetNode[], parentId: string | null) => {
    for (const preset of presets) {
      const id = newNodeId();
      nodes.push({ id, kind: preset.kind, title: preset.title, parentId });
      if (preset.children) append(preset.children, id);
    }
  };

  append(STRUCTURE_PRESETS[workType], null);
  return { version: 1, nodes };
}

/** Escapes a title before it is handed to the editor as HTML. */
function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) =>
    character === "&"
      ? "&amp;"
      : character === "<"
        ? "&lt;"
        : character === ">"
          ? "&gt;"
          : "&quot;",
  );
}

/**
 * The heading that mirrors one outline element in the draft. The section id is
 * what lets the tree find, retitle and jump to that element again.
 */
export function sectionHeadingHtml(node: StructureNode): string {
  const level = KIND_META[node.kind].heading;
  return `<h${level} data-section-id="${escapeHtml(node.id)}">${escapeHtml(node.title)}</h${level}>`;
}

/** The whole outline as draft headings, in outline order. */
export function structureToHtml(structure: Structure): string {
  return structure.nodes.map(sectionHeadingHtml).join("");
}

import {
  KIND_META,
  newNodeId,
  renumberTitles,
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
 * Numbers are not written here: they are derived from the tree afterwards.
 */
export const STRUCTURE_PRESETS: Record<WorkType, PresetNode[]> = {
  novel: [
    { kind: "title", title: "Title" },
    { kind: "subtitle", title: "Subtitle" },
    { kind: "dedication", title: "Dedication" },
    { kind: "epigraph", title: "Epigraph" },
    { kind: "table_of_contents", title: "Table of Contents" },
    { kind: "introduction", title: "Introduction" },
    { kind: "chapter", title: "Chapter" },
    { kind: "chapter", title: "Chapter" },
    { kind: "chapter", title: "Chapter" },
    { kind: "conclusion", title: "Conclusion" },
    { kind: "about_author", title: "About the Author" },
  ],
  novella: [
    { kind: "title", title: "Title" },
    { kind: "subtitle", title: "Subtitle" },
    { kind: "dedication", title: "Dedication" },
    { kind: "table_of_contents", title: "Table of Contents" },
    { kind: "chapter", title: "Chapter" },
    { kind: "chapter", title: "Chapter" },
    { kind: "conclusion", title: "Conclusion" },
    { kind: "about_author", title: "About the Author" },
  ],
  short_story: [
    { kind: "title", title: "Title" },
    { kind: "subtitle", title: "Subtitle" },
    { kind: "scene", title: "Scene" },
    { kind: "scene", title: "Scene" },
    { kind: "scene", title: "Scene" },
  ],
  essay: [
    { kind: "title", title: "Title" },
    { kind: "introduction", title: "Introduction" },
    { kind: "section", title: "Thesis" },
    { kind: "section", title: "Argument 1" },
    { kind: "section", title: "Argument 2" },
    { kind: "conclusion", title: "Conclusion" },
    { kind: "bibliography", title: "Bibliography" },
  ],
  poetry: [
    { kind: "title", title: "Title" },
    { kind: "dedication", title: "Dedication" },
    { kind: "epigraph", title: "Epigraph" },
    { kind: "poem", title: "Poem" },
    { kind: "poem", title: "Poem" },
    { kind: "poem", title: "Poem" },
    { kind: "poem", title: "Poem" },
    { kind: "notes", title: "Notes" },
  ],
  nonfiction: [
    { kind: "title", title: "Title" },
    { kind: "subtitle", title: "Subtitle" },
    { kind: "table_of_contents", title: "Table of Contents" },
    { kind: "introduction", title: "Introduction" },
    { kind: "chapter", title: "Chapter" },
    { kind: "chapter", title: "Chapter" },
    { kind: "chapter", title: "Chapter" },
    { kind: "bibliography", title: "Bibliography" },
    { kind: "index", title: "Index" },
  ],
  memoir: [
    { kind: "title", title: "Title" },
    { kind: "dedication", title: "Dedication" },
    { kind: "chapter", title: "Chapter" },
    { kind: "chapter", title: "Chapter" },
    { kind: "chapter", title: "Chapter" },
    { kind: "afterword", title: "Afterword" },
  ],
  drama: [
    { kind: "title", title: "Title" },
    { kind: "prologue", title: "Prologue" },
    {
      kind: "part",
      title: "Act I",
      children: [
        { kind: "scene", title: "Scene" },
        { kind: "scene", title: "Scene" },
      ],
    },
    {
      kind: "part",
      title: "Act II",
      children: [
        { kind: "scene", title: "Scene" },
        { kind: "scene", title: "Scene" },
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
  return { version: 1, nodes: renumberTitles(nodes) };
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
  const { heading: level, label } = KIND_META[node.kind];
  // The role rides along as a placeholder, so a heading the writer has emptied
  // still names the element it stands for, and the tag matches its role.
  return `<h${level} data-section-id="${escapeHtml(node.id)}" data-placeholder="${escapeHtml(label)}">${escapeHtml(node.title)}</h${level}>`;
}

/** The whole outline as draft headings, in outline order. */
export function structureToHtml(structure: Structure): string {
  return structure.nodes.map(sectionHeadingHtml).join("");
}

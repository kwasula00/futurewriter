"use client";

import { useEffect, useRef, useState } from "react";

import { updateProjectStructure } from "@/app/actions/projects";
import { ProjectsSidebar } from "@/app/ui/projects-sidebar";
import { StructureTree } from "@/app/ui/structure-tree";
import { WorkspaceEditor, type EditorHandle } from "@/app/ui/workspace-editor";
import type { PageSettings } from "@/lib/pages/schemas";
import { createPresetStructure } from "@/lib/structure/presets";
import {
  changedTitles,
  descendantIds,
  emptyStructure,
  insertRootNode,
  moveNode,
  outlineOrder,
  renumberTitles,
  type MoveDirection,
  type Structure,
  type StructureNode,
  type WorkType,
} from "@/lib/structure/schemas";

type ProjectSummary = {
  id: string;
  title: string;
};

type ProjectDetail = {
  id: string;
  title: string;
  content: string;
  workType: WorkType;
  structure: Structure;
  page: PageSettings;
};

/**
 * Holds the outline, which the left column edits and the centre column writes:
 * the two are one document, so their state and the editor handle live here.
 */
export function WorkspaceShell({
  projects,
  selected,
  openDiagram = false,
  openTodo = false,
}: {
  projects: ProjectSummary[];
  selected: ProjectDetail | null;
  /** Set when the workspace was opened from the header's Story Diagram link. */
  openDiagram?: boolean;
  /** Set when the workspace was opened from the header's To-do list link. */
  openTodo?: boolean;
}) {
  const editorRef = useRef<EditorHandle>(null);
  const [workType, setWorkType] = useState<WorkType>(selected?.workType ?? "novel");
  const [structure, setStructure] = useState<Structure>(selected?.structure ?? emptyStructure);

  // Every outline edit is persisted, but a rename can arrive key by key, so
  // writes wait until the writer pauses.
  const projectId = selected?.id ?? null;
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (!projectId) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void updateProjectStructure(projectId, workType, structure);
    }, 800);
    return () => clearTimeout(timer);
  }, [projectId, workType, structure]);

  // The outline is the spine of the draft, so the two are kept together: any
  // element the outline holds but the draft is missing is written back in. It
  // runs on opening a project — a saved draft may predate the current outline —
  // and after every outline edit, so an element can never be absent from the
  // draft it belongs to.
  useEffect(() => {
    if (!projectId) return;
    editorRef.current?.insertMissingSections(structure.nodes);
  }, [projectId, structure]);

  function handleWorkTypeChange(next: WorkType) {
    setWorkType(next);
    // Switching type loads that kind's skeleton; the sync below writes the
    // headings the draft is missing, and the prose already written stays.
    setStructure(createPresetStructure(next));
  }

  /** Pulls the draft's headings back in line with the renumbered outline. */
  function syncTitles(before: StructureNode[], after: StructureNode[]) {
    for (const change of changedTitles(before, after)) {
      editorRef.current?.renameSection(change.id, change.title);
    }
  }

  function handleAdd(node: StructureNode) {
    // A prologue opens the book and an epilogue closes it, so the new element
    // is placed by its role rather than simply appended.
    const nodes = renumberTitles(insertRootNode(structure.nodes, node));
    const placed = nodes.find((entry) => entry.id === node.id) ?? node;
    setStructure({ ...structure, nodes });
    editorRef.current?.insertSection(placed);
    editorRef.current?.reorderSections(nodes.map((entry) => entry.id));
    syncTitles(structure.nodes, nodes);
  }

  function handleRename(id: string, title: string) {
    const nodes = renumberTitles(
      structure.nodes.map((node) => (node.id === id ? { ...node, title } : node)),
    );
    setStructure({ ...structure, nodes });
    syncTitles(structure.nodes, nodes);
  }

  /**
   * Follows the prose: a heading edited in the draft carries its new text back
   * into the outline, which the tree and the contents both read. The text is
   * kept as the writer left it rather than renumbered, so the entry says
   * exactly what the draft does; the derived numbering is rebuilt the next time
   * the outline itself changes.
   */
  function handleSectionTitles(sections: { id: string; title: string }[]) {
    const changed = sections.filter((section) => {
      const node = structure.nodes.find((entry) => entry.id === section.id);
      return node !== undefined && node.title !== section.title;
    });
    if (changed.length === 0) return;

    const nodes = structure.nodes.map((node) => {
      const edit = changed.find((section) => section.id === node.id);
      return edit ? { ...node, title: edit.title } : node;
    });
    setStructure({ ...structure, nodes });
  }

  function handleRemove(id: string) {
    const ids = [id, ...descendantIds(structure.nodes, id)];
    const nodes = renumberTitles(structure.nodes.filter((node) => !ids.includes(node.id)));
    setStructure({ ...structure, nodes });
    editorRef.current?.removeSections(ids);
    syncTitles(structure.nodes, nodes);
  }

  function handleMove(id: string, direction: MoveDirection) {
    const moved = moveNode(structure.nodes, id, direction);
    // The element is already at the end of its group, so nothing travels.
    if (moved === structure.nodes) return;

    const nodes = renumberTitles(moved);
    setStructure({ ...structure, nodes });
    // The outline is the order of the draft, so the headings follow the move.
    editorRef.current?.reorderSections(nodes.map((node) => node.id));
    syncTitles(structure.nodes, nodes);
  }

  return (
    <>
      <ProjectsSidebar projects={projects} selectedId={selected?.id}>
        {selected && (
          <>
            <StructureTree
              workType={workType}
              structure={structure}
              onWorkTypeChange={handleWorkTypeChange}
              onAdd={handleAdd}
              onRename={handleRename}
              onRemove={handleRemove}
              onMove={handleMove}
              onJump={(id) => editorRef.current?.jumpToSection(id)}
            />
            <TableOfContents
              nodes={structure.nodes}
              onJump={(id) => editorRef.current?.jumpToSection(id)}
            />
          </>
        )}
      </ProjectsSidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <WorkspaceEditor
            ref={editorRef}
            project={selected}
            openDiagram={openDiagram}
            openTodo={openTodo}
            onSectionTitlesChange={handleSectionTitles}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-black/[.15] p-10 text-center dark:border-white/[.2]">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {projects.length > 0
                ? "Select a project on the left to open it for editing."
                : "No projects yet. Use “Add new project” to start writing."}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The work's spine as a table of contents: every element with the number its
 * place in the tree gives it, indented by depth, each one a link into the
 * draft. It reads the same outline the tree edits, so it is always current.
 */
function TableOfContents({
  nodes,
  onJump,
}: {
  nodes: StructureNode[];
  onJump: (id: string) => void;
}) {
  const entries = outlineOrder(nodes);

  return (
    <section className="flex flex-col gap-1 rounded-xl border border-black/[.08] p-2 dark:border-white/[.12]">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Table of Contents
      </h2>
      {entries.length === 0 ? (
        <p className="px-1 py-1 text-xs text-zinc-500 dark:text-zinc-400">No elements yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {entries.map(({ node, depth }) => (
            <li key={node.id} style={{ paddingLeft: depth * 10 }}>
              <button
                type="button"
                onClick={() => onJump(node.id)}
                title={`Jump to ${node.title}`}
                className="w-full truncate rounded px-1.5 py-0.5 text-left text-xs text-zinc-600 transition-colors hover:bg-black/[.05] dark:text-zinc-300 dark:hover:bg-white/[.08]"
              >
                {node.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

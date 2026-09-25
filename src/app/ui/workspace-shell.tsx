"use client";

import { useEffect, useRef, useState } from "react";

import { updateProjectStructure } from "@/app/actions/projects";
import { ProjectsSidebar } from "@/app/ui/projects-sidebar";
import { StructureTree } from "@/app/ui/structure-tree";
import { WorkspaceEditor, type EditorHandle } from "@/app/ui/workspace-editor";
import type { PageSettings } from "@/lib/pages/schemas";
import { createPresetStructure } from "@/lib/structure/presets";
import {
  descendantIds,
  emptyStructure,
  moveNode,
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
}: {
  projects: ProjectSummary[];
  selected: ProjectDetail | null;
  /** Set when the workspace was opened from the header's Story Diagram link. */
  openDiagram?: boolean;
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

  function handleWorkTypeChange(next: WorkType) {
    setWorkType(next);
    // Switching type loads that kind's skeleton: the headings the draft is
    // missing are added, and the prose already written stays untouched.
    const preset = createPresetStructure(next);
    setStructure(preset);
    editorRef.current?.insertMissingSections(preset.nodes);
  }

  function handleAdd(node: StructureNode) {
    setStructure((current) => ({ ...current, nodes: [...current.nodes, node] }));
    editorRef.current?.insertSection(node);
  }

  function handleRename(id: string, title: string) {
    setStructure((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, title } : node)),
    }));
    editorRef.current?.renameSection(id, title);
  }

  function handleRemove(id: string) {
    const ids = [id, ...descendantIds(structure.nodes, id)];
    setStructure((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !ids.includes(node.id)),
    }));
    editorRef.current?.removeSections(ids);
  }

  function handleMove(id: string, direction: MoveDirection) {
    const nodes = moveNode(structure.nodes, id, direction);
    // The element is already at the end of its group, so nothing travels.
    if (nodes === structure.nodes) return;

    setStructure((current) => ({ ...current, nodes }));
    // The outline is the order of the draft, so the headings follow the move.
    editorRef.current?.reorderSections(nodes.map((node) => node.id));
  }

  return (
    <>
      <ProjectsSidebar projects={projects} selectedId={selected?.id}>
        {selected && (
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
        )}
      </ProjectsSidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <WorkspaceEditor ref={editorRef} project={selected} openDiagram={openDiagram} />
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { createProject, deleteProject } from "@/app/actions/projects";
import { WORK_TYPES, WORK_TYPE_META, type WorkType } from "@/lib/structure/schemas";

type ProjectSummary = {
  id: string;
  title: string;
};

/** Six random digits the user has to retype before a project is deleted. */
function generateConfirmationCode() {
  const values = new Uint32Array(6);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => (value % 10).toString()).join("");
}

export function ProjectsSidebar({
  projects,
  selectedId,
  children,
}: {
  projects: ProjectSummary[];
  selectedId?: string;
  /** Extra panel below the list, where the open work's outline is shown. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<{
    id: string;
    title: string;
    code: string;
  } | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newWorkType, setNewWorkType] = useState<WorkType>("novel");

  const canDelete = confirming !== null && typed === confirming.code;
  const canCreate = newTitle.trim() !== "";

  function startConfirm(project: ProjectSummary) {
    setConfirming({ id: project.id, title: project.title, code: generateConfirmationCode() });
    setTyped("");
  }

  function cancelCreate() {
    setCreating(false);
    setNewTitle("");
  }

  function cancelConfirm() {
    setConfirming(null);
    setTyped("");
  }

  async function handleDelete() {
    if (!confirming || !canDelete) return;

    const { id } = confirming;
    setBusy(true);
    try {
      await deleteProject(id);
      cancelConfirm();
      if (id === selectedId) {
        router.replace("/workspace");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 px-3 lg:w-64">
      {creating ? (
        <form action={createProject} className="flex flex-col gap-2">
          <input
            name="title"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            autoFocus
            maxLength={120}
            autoComplete="off"
            placeholder="Project name"
            aria-label="New project name"
            className="w-full rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-white/[.2] dark:focus:border-zinc-50"
          />
          <label className="sr-only" htmlFor="new-work-type">
            Kind of work
          </label>
          <select
            id="new-work-type"
            name="workType"
            value={newWorkType}
            onChange={(event) => setNewWorkType(event.target.value as WorkType)}
            className="w-full rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-white/[.2] dark:focus:border-zinc-50"
          >
            {WORK_TYPES.map((type) => (
              <option key={type} value={type}>
                {WORK_TYPE_META[type].label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!canCreate}
              className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Create
            </button>
            <button
              type="button"
              onClick={cancelCreate}
              className="rounded-lg border border-black/[.15] px-3 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add new project
        </button>
      )}

      <nav className="flex flex-col gap-1">
        {projects.length === 0 && (
          <p className="px-1 py-2 text-sm text-zinc-500 dark:text-zinc-400">No projects yet.</p>
        )}

        {projects.map((project) => {
          const isSelected = project.id === selectedId;

          return (
            <div
              key={project.id}
              className={`flex items-center gap-1 rounded-lg pr-1 ${
                isSelected ? "bg-black/[.05] dark:bg-white/[.08]" : ""
              }`}
            >
              <Link
                href={`/workspace?project=${project.id}`}
                title="Open for editing"
                className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-sm transition-colors hover:text-zinc-950 dark:hover:text-zinc-50 ${
                  isSelected
                    ? "font-medium text-zinc-950 dark:text-zinc-50"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {project.title}
              </Link>
              <button
                type="button"
                onClick={() => startConfirm(project)}
                aria-label={`Delete ${project.title}`}
                className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
              >
                Delete
              </button>
            </div>
          );
        })}
      </nav>

      {confirming && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[.04] p-3">
          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            Type <span className="font-mono font-semibold">{confirming.code}</span> to delete “
            {confirming.title}”.
          </p>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Confirmation code"
            placeholder="000000"
            className="mt-2 w-full rounded-md border border-black/[.15] bg-transparent px-2 py-1.5 font-mono text-sm tracking-[0.3em] outline-none focus:border-zinc-900 dark:border-white/[.2] dark:focus:border-zinc-50"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || busy}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Deleting..." : "Delete project"}
            </button>
            <button
              type="button"
              onClick={cancelConfirm}
              disabled={busy}
              className="rounded-md border border-black/[.15] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {children}
    </aside>
  );
}
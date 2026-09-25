import type { Metadata } from "next";

import { WorkspaceShell } from "@/app/ui/workspace-shell";
import { getProject, getProjects } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Workspace | FutureWriter",
};

export default async function WorkspacePage(props: PageProps<"/workspace">) {
  const params = await props.searchParams;
  // The header's links land here, so the window they ask for is up with the
  // project instead of asking for a second click.
  const openDiagram = params.diagram === "1";
  const openTodo = params.todo === "1";

  const projects = await getProjects();
  // The diagram and the to-do list both read a project, so a bare link opens
  // the one most recently written in rather than an empty workspace with
  // nothing to show.
  const requestedId =
    typeof params.project === "string"
      ? params.project
      : openDiagram || openTodo
        ? projects[0]?.id
        : undefined;

  const selected = requestedId ? await getProject(requestedId) : null;

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="flex w-full flex-1 flex-col gap-6 lg:flex-row">
        <WorkspaceShell
          key={selected?.id ?? "none"}
          projects={projects}
          selected={selected}
          openDiagram={openDiagram}
          openTodo={openTodo}
        />
      </div>
    </main>
  );
}
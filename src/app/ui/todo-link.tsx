"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * The header's way into the project's to-do list. It sits above the page in a
 * shared layout, which is not re-rendered during navigation and never receives
 * the query string, so the address bar is the only place it can read which
 * project is open from. The hook re-renders the link whenever the query string
 * changes, which carries the open project over without any manual bookkeeping.
 */
export function TodoLink() {
  const project = useSearchParams().get("project");
  const href = project
    ? `/workspace?project=${encodeURIComponent(project)}&todo=1`
    : "/workspace?todo=1";

  return (
    <Link
      href={href}
      className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
    >
      To-do list
    </Link>
  );
}

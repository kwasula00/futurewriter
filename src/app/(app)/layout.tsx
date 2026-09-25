import Link from "next/link";

import { logout } from "@/app/actions/auth";
import { StoryDiagramLink } from "@/app/ui/story-diagram-link";
import { getUser } from "@/lib/dal";

/**
 * Chrome for every signed-in page. Lives in the `(app)` route group so the
 * marketing, login and signup routes stay free of it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-black/[.08] dark:border-white/[.12]">
        <div className="flex w-full items-center justify-between gap-4 px-6 py-3">
          <Link href="/workspace" className="text-sm font-semibold tracking-tight">
            FutureWriter
          </Link>

          <nav className="flex items-center gap-4">
            {/* Keeps the open project when it links back into the workspace. */}
            <StoryDiagramLink />
            <Link
              href="/dashboard"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Dashboard
            </Link>
            <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">
              {user.displayName}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-black/[.12] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.18] dark:hover:bg-white/[.06]"
              >
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}

import type { Metadata } from "next";

import { getUser } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Dashboard | FutureWriter",
};

export default async function DashboardPage() {
  const user = await getUser();

  return (
    <main className="flex flex-1 flex-col px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.displayName}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{user.email}</p>

        <section className="mt-10 rounded-2xl border border-black/[.08] p-6 dark:border-white/[.12]">
          <h2 className="text-lg font-medium">Account overview</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Your documents, drafts and model usage will be summarised here.
          </p>
        </section>
      </div>
    </main>
  );
}

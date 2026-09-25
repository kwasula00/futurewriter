import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FutureWriter",
  description: "An AI-powered editor for novels, stories and advertising copy.",
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">FutureWriter</h1>
        <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          An AI-powered writing environment for creative writers. Draft novels, short stories and ad
          copy with a reasoning model at your side.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-full border border-black/[.12] px-8 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.18] dark:hover:bg-white/[.06]"
          >
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
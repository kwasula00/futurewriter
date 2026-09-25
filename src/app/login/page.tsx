import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/ui/login-form";

export const metadata: Metadata = {
  title: "Log in | FutureWriter",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          FutureWriter
        </Link>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Welcome back. Pick up where you left off.
        </p>

        {error === "confirmation_failed" && (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            We could not confirm your email address. Try logging in, or sign up again.
          </p>
        )}

        <LoginForm />

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          New to FutureWriter?{" "}
          <Link href="/signup" className="font-medium text-zinc-950 underline dark:text-zinc-50">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
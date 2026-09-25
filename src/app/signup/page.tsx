import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/app/ui/signup-form";

export const metadata: Metadata = {
  title: "Create your account | FutureWriter",
};

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          FutureWriter
        </Link>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Set up your writer profile to start drafting stories, novels and ad copy with AI.
        </p>

        <SignupForm />

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-zinc-950 underline dark:text-zinc-50">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
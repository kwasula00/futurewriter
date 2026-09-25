"use client";

import { useActionState } from "react";

import { signup } from "@/app/actions/auth";
import { TurnstileWidget } from "@/app/ui/turnstile-widget";

const labelClass = "text-sm font-medium text-zinc-950 dark:text-zinc-50";
const inputClass =
  "mt-1.5 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-500 dark:border-white/[.18] dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400";
const errorClass = "mt-1.5 text-xs text-red-600 dark:text-red-400";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <div>
        <label htmlFor="displayName" className={labelClass}>
          Display name
        </label>
        <input id="displayName" name="displayName" placeholder="Ada Lovelace" className={inputClass} />
        {state?.errors?.displayName && (
          <ul className={errorClass}>
            {state.errors.displayName.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" name="email" type="email" placeholder="you@example.com" className={inputClass} />
        {state?.errors?.email && (
          <ul className={errorClass}>
            {state.errors.email.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input id="password" name="password" type="password" className={inputClass} />
        {state?.errors?.password && (
          <div className={errorClass}>
            <p>Password must:</p>
            <ul>
              {state.errors.password.map((error) => (
                <li key={error}>- {error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <TurnstileWidget />
        {state?.errors?.captcha && (
          <ul className={errorClass}>
            {state.errors.captcha.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      {state?.message && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {state.message}
        </p>
      )}
      {state?.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-foreground text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
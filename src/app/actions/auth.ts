"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import { createClient } from "@/lib/supabase/server";
import { LoginFormSchema, SignupFormSchema, type FormState } from "@/lib/definitions";
import { verifyTurnstile } from "@/lib/turnstile";

async function getOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  return origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signup(state: FormState, formData: FormData): Promise<FormState> {
  const validatedFields = SignupFormSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const captchaToken = formData.get("turnstileToken");
  const captchaValid = await verifyTurnstile(typeof captchaToken === "string" ? captchaToken : null);

  if (!captchaValid) {
    return {
      errors: { captcha: ["CAPTCHA verification failed. Please try again."] },
    };
  }

  const { displayName, email, password } = validatedFields.data;
  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { message: error.message };
  }

  // With email confirmation enabled Supabase returns a user but no session.
  if (!data.session) {
    return {
      success: `Account created. We sent a confirmation link to ${email} - open it, then log in.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/workspace");
}

export async function login(state: FormState, formData: FormData): Promise<FormState> {
  const validatedFields = LoginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(validatedFields.data);

  if (error) {
    return { message: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/workspace");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
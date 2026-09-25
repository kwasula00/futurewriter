import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { PageSettingsSchema, defaultPage } from "@/lib/pages/schemas";
import {
  StructureSchema,
  WorkTypeSchema,
  emptyStructure,
} from "@/lib/structure/schemas";

/**
 * Data Access Layer. Every server-side read of user data should go through
 * here so the auth check can never be forgotten.
 */
export const verifySession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { isAuth: true, userId: user.id, email: user.email ?? null };
});

export const getUser = cache(async () => {
  const session = await verifySession();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", session.userId)
    .maybeSingle();

  return {
    id: session.userId,
    email: session.email,
    displayName: profile?.display_name ?? session.email?.split("@")[0] ?? "Writer",
  };
});

export const getProjects = cache(async () => {
  const session = await verifySession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select("id, title, updated_at")
    .eq("user_id", session.userId)
    .order("updated_at", { ascending: false });

  return data ?? [];
});

export const getProject = cache(async (projectId: string) => {
  const session = await verifySession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select("id, title, content, work_type, structure, page")
    .eq("id", projectId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!data) return null;

  // Those columns are stored loosely, so a row that predates them falls back to
  // an empty outline of the default type and the default page instead of
  // breaking the workspace.
  const workType = WorkTypeSchema.safeParse(data.work_type);
  const structure = StructureSchema.safeParse(data.structure);
  const page = PageSettingsSchema.safeParse(data.page);

  return {
    id: data.id,
    title: data.title,
    content: data.content,
    workType: workType.success ? workType.data : ("novel" as const),
    structure: structure.success ? structure.data : emptyStructure,
    page: page.success ? page.data : defaultPage,
  };
});
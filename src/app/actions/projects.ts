"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { verifySession } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { PageSettings } from "@/lib/pages/schemas";
import { WorkTypeSchema, type Structure, type WorkType } from "@/lib/structure/schemas";
import { createPresetStructure, structureToHtml } from "@/lib/structure/presets";

export async function createProject(formData: FormData): Promise<void> {
  const session = await verifySession();
  const supabase = await createClient();

  const requested = formData.get("title");
  const title =
    typeof requested === "string" && requested.trim() !== "" ? requested.trim() : "Untitled document";

  // A new work starts from the skeleton of its own kind, headings included.
  const requestedType = WorkTypeSchema.safeParse(formData.get("workType"));
  const workType: WorkType = requestedType.success ? requestedType.data : "novel";
  const structure = createPresetStructure(workType);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: session.userId,
      title,
      work_type: workType,
      structure,
      content: structureToHtml(structure),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Could not create the project.");
  }

  revalidatePath("/workspace");
  redirect(`/workspace?project=${data.id}`);
}

export async function updateProject(
  projectId: string,
  title: string,
  content: string,
): Promise<void> {
  const session = await verifySession();
  const supabase = await createClient();

  // The user_id filter is redundant next to RLS, but keeps the intent explicit.
  const { error } = await supabase
    .from("projects")
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", session.userId);

  if (error) {
    throw new Error("Could not save the project.");
  }

  revalidatePath("/workspace");
}

export async function updateProjectStructure(
  projectId: string,
  workType: WorkType,
  structure: Structure,
): Promise<void> {
  const session = await verifySession();
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ work_type: workType, structure, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", session.userId);

  if (error) {
    throw new Error("Could not save the project structure.");
  }
}

export async function updateProjectPage(projectId: string, page: PageSettings): Promise<void> {
  const session = await verifySession();
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ page, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", session.userId);

  if (error) {
    throw new Error("Could not save the page settings.");
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  const session = await verifySession();
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", session.userId);

  if (error) {
    throw new Error("Could not delete the project.");
  }

  revalidatePath("/workspace");
}
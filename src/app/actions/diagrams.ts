"use server";

import { createClient } from "@/lib/supabase/server";
import {
  StoryDiagramDataSchema,
  emptyDiagram,
  type StoryDiagramData,
} from "@/lib/world/diagram";

/** Enough of a diagram to choose between the ones a project holds. */
export type StoryDiagramSummary = { id: string; name: string };

/** A stored diagram read loosely, so a row that predates a field still opens. */
function readData(stored: unknown): StoryDiagramData {
  const parsed = StoryDiagramDataSchema.safeParse(stored);
  return parsed.success ? parsed.data : emptyDiagram;
}

/** The diagrams a project holds, in the order they were started. */
export async function listStoryDiagrams(projectId: string): Promise<StoryDiagramSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("story_diagrams")
    .select("id, name")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

/** One diagram with everything drawn on it, or null if it is gone. */
export async function getStoryDiagram(
  id: string,
): Promise<{ id: string; name: string; data: StoryDiagramData } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("story_diagrams")
    .select("id, name, data")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, name: data.name, data: readData(data.data) };
}

/** Starts an empty diagram for a project — the canvas the writer then fills. */
export async function createStoryDiagram(
  projectId: string,
  name: string,
): Promise<{ id: string; name: string; data: StoryDiagramData }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("story_diagrams")
    .insert({
      project_id: projectId,
      name: name.trim() || "Story Flow",
      data: emptyDiagram,
    })
    .select("id, name, data")
    .single();

  if (error || !data) throw new Error("Could not start a diagram.");
  return { id: data.id, name: data.name, data: readData(data.data) };
}

/** Writes a diagram back — its name and everything drawn on it. */
export async function saveStoryDiagram(input: {
  id: string;
  name: string;
  data: StoryDiagramData;
}): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("story_diagrams")
    .update({
      name: input.name.trim() || "Story Flow",
      data: input.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
}

/** Removes a diagram the project no longer needs. */
export async function deleteStoryDiagram(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("story_diagrams").delete().eq("id", id);
}

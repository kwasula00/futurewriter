"use server";

import { createClient } from "@/lib/supabase/server";
import {
  StoryBibleSchema,
  emptyBible,
  type StoryBible,
} from "@/lib/world/schemas";

/** The shape of a single field's parser, enough to read one field on its own. */
type FieldSchema = {
  safeParse: (value: unknown) =>
    | { success: true; data: unknown }
    | { success: false };
};

/**
 * Reads a stored bible. The document as a whole is parsed first; one that does
 * not parse is not thrown away, because losing every rule the writer pasted —
 * the language rules among them — to a single malformed value elsewhere is
 * worse than reading around it. Each field is then read on its own, and only a
 * field that cannot be read at all falls back to the empty bible. So the rules
 * survive a bad edit rather than being reset by it.
 */
function readBible(stored: unknown): StoryBible {
  const whole = StoryBibleSchema.safeParse(stored);
  if (whole.success) return whole.data;
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return emptyBible;
  }

  const source = stored as Record<string, unknown>;
  const read: Record<string, unknown> = { ...emptyBible };
  const shape = StoryBibleSchema.shape as unknown as Record<string, FieldSchema>;
  for (const key of Object.keys(shape)) {
    if (!(key in source)) continue;
    const field = shape[key].safeParse(source[key]);
    if (field.success) read[key] = field.data;
  }
  const salvaged = StoryBibleSchema.safeParse(read);
  return salvaged.success ? salvaged.data : emptyBible;
}

export async function getStoryBible(projectId: string): Promise<StoryBible> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("story_bibles")
    .select("bible")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data?.bible) return emptyBible;
  return readBible(data.bible);
}

export async function saveStoryBible(projectId: string, bible: StoryBible) {
  const supabase = await createClient();
  await supabase
    .from("story_bibles")
    .upsert(
      {
        project_id: projectId,
        bible,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
}
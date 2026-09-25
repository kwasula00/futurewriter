"use server";

import { verifySession } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import {
  LanguagePolicySchema,
  emptyLanguagePolicy,
  type LanguagePolicy,
  type LanguageTemplate,
} from "@/lib/world/schemas";

const COLUMNS = "id, name, policy";

/** A stored row read loosely: the policy is JSONB, so a row that predates a
 *  field, or one hand-edited, still yields a policy the panel can show. */
function readTemplate(row: {
  id: string;
  name: string;
  policy: unknown;
}): LanguageTemplate {
  const policy = LanguagePolicySchema.safeParse(row.policy);
  return {
    id: row.id,
    name: row.name,
    policy: policy.success ? policy.data : emptyLanguagePolicy,
  };
}

/** The templates the writer has kept, in name order. */
export async function listLanguageTemplates(): Promise<LanguageTemplate[]> {
  const session = await verifySession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("language_templates")
    .select(COLUMNS)
    .eq("user_id", session.userId)
    .order("name", { ascending: true });

  return (data ?? []).map(readTemplate);
}

/**
 * Saves a policy as a template. With an id, that template is overwritten —
 * name included, so a template can be renamed as it is edited. Without one, the
 * name is what tells the templates apart: a name already kept is replaced, so
 * saving the same rules twice leaves one template rather than two.
 */
export async function saveLanguageTemplate(input: {
  id?: string;
  name: string;
  policy: LanguagePolicy;
}): Promise<LanguageTemplate> {
  const session = await verifySession();
  const supabase = await createClient();

  const name = input.name.trim();
  if (name === "") throw new Error("Give the template a name.");

  const values = {
    name,
    policy: input.policy,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("language_templates")
      .update(values)
      .eq("id", input.id)
      .eq("user_id", session.userId)
      .select(COLUMNS)
      .single();

    if (error || !data) throw new Error("Could not save the template.");
    return readTemplate(data);
  }

  const { data, error } = await supabase
    .from("language_templates")
    .upsert({ ...values, user_id: session.userId }, { onConflict: "user_id,name" })
    .select(COLUMNS)
    .single();

  if (error || !data) throw new Error("Could not save the template.");
  return readTemplate(data);
}

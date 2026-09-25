import { NextResponse } from "next/server";
import { compileStoryContext } from "@/lib/world/compile";
import {
  SceneOutputSchema,
  type StoryBible,
  type ContinuityEntry,
} from "@/lib/world/schemas";

export const runtime = "nodejs";

const MODEL = "deepseek/deepseek-v4.1-flash";

export async function POST(req: Request) {
  const { bible, sceneId, previousScenes } = (await req.json()) as {
    bible: StoryBible;
    sceneId: string;
    previousScenes: ContinuityEntry[];
  };

  const { systemPrompt, sceneContext } = compileStoryContext(
    bible,
    sceneId,
    previousScenes,
  );

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPEN_ROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://futurewriter.app",
        "X-Title": "FutureWriter",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: sceneContext },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 4096,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: `Upstream ${response.status}`, detail: text },
      { status: 502 },
    );
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Model did not return valid JSON", raw },
      { status: 422 },
    );
  }

  const schema = SceneOutputSchema.safeParse(parsed);
  if (!schema.success) {
    return NextResponse.json(
      { error: "Schema mismatch", details: schema.error.message, raw },
      { status: 422 },
    );
  }

  return NextResponse.json({ output: schema.data });
}
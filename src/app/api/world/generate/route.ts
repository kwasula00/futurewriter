import { NextResponse } from "next/server";
import { z } from "zod";
import { compileStoryContext } from "@/lib/world/compile";
import {
  SceneOutputSchema,
  type StoryBible,
  type ContinuityEntry,
} from "@/lib/world/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "deepseek/deepseek-v4.1-flash";

/**
 * A scene plus the facts it established runs long, and the whole answer has to
 * fit inside the budget: a reply cut off at the limit arrives as an unfinished
 * JSON object that cannot be parsed.
 */
const MAX_TOKENS = 8000;

/** One turn of the chat a scene is worked in on the Story Diagram. */
type SceneChatTurn = { role: "user" | "assistant"; content: string };

/**
 * The shape the reply must have, handed to the model up front. Asking merely
 * for "JSON" is a hint a provider is free to ignore, and a reply that parses
 * but carries the wrong fields is worse than one that fails outright: it
 * reaches the writer as a scene with no prose. A strict schema is enforced
 * while the reply is generated, so the keys are there by construction.
 */
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "scene_output",
    strict: true,
    schema: z.toJSONSchema(SceneOutputSchema),
  },
} as const;

export async function POST(req: Request) {
  const { bible, sceneId, previousScenes, sceneOrder, history } =
    (await req.json()) as {
      bible: StoryBible;
      sceneId: string;
      previousScenes: ContinuityEntry[];
      /** Every scene id, in the order the diagram's green links place them. */
      sceneOrder?: string[];
      /** The turns already exchanged about this scene, oldest first. */
      history?: SceneChatTurn[];
    };

  const turns = history ?? [];

  const { systemPrompt, sceneContext } = compileStoryContext(
    bible,
    sceneId,
    previousScenes,
    { sceneOrder, revising: turns.length > 0 },
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
          // What has already been said about this scene rides along, so a
          // follow-up is read as a change to the draft rather than a fresh
          // start. The assistant's own turns are its earlier drafts, in prose.
          ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
        ],
        response_format: RESPONSE_FORMAT,
        // This is a structured reply, not prose to be reasoned about: left on,
        // reasoning spends the whole token budget before the answer is begun
        // and the reply comes back empty.
        reasoning: { enabled: false },
        temperature: 0.7,
        max_tokens: MAX_TOKENS,
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
  const choice = data.choices?.[0];
  const raw: string = choice?.message?.content ?? "";

  // An unfinished reply is reported as what it is: "cut off" tells the writer
  // to ask again or shorten the scene, where "invalid JSON" only says the
  // parser was unhappy.
  if (choice?.finish_reason === "length") {
    return NextResponse.json(
      {
        error:
          "The scene was cut off before it finished. Ask again, or shorten the scene length in Narrative rules.",
      },
      { status: 502 },
    );
  }

  if (raw.trim() === "") {
    return NextResponse.json(
      { error: "The model returned an empty reply. Ask again." },
      { status: 502 },
    );
  }

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
      { error: "The reply did not match the scene format. Ask again.", details: schema.error.message, raw },
      { status: 422 },
    );
  }

  return NextResponse.json({ output: schema.data });
}
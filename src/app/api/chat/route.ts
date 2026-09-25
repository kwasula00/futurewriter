import type { NextRequest } from "next/server";
import {
  PINNED_PROVIDER,
  WRITER_MODEL,
  createOpenRouterClient,
  withoutReasoningDetails,
  type ChatCompletionStream,
  type OpenRouterDelta,
  type OpenRouterMessage,
  type OpenRouterParams,
} from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Reasoning tokens are consumed before any content is emitted, so the budget
 * has to leave room for both.
 */
const MAX_TOKENS = 8000;

export async function POST(request: NextRequest) {
  let messages: OpenRouterMessage[];

  try {
    ({ messages } = (await request.json()) as { messages: OpenRouterMessage[] });
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "`messages` must be a non-empty array." }, { status: 400 });
  }

  const client = createOpenRouterClient();
  const base = {
    model: WRITER_MODEL,
    max_tokens: MAX_TOKENS,
    reasoning: { enabled: true },
  };

  let stream: ChatCompletionStream;

  try {
    // Assigned to a typed variable rather than passed as a literal: the extra
    // `provider` field would otherwise fail excess-property checking against
    // the SDK's overloads.
    const pinnedParams: OpenRouterParams = {
      ...base,
      messages,
      stream: true,
      provider: { only: [PINNED_PROVIDER], allow_fallbacks: false },
    };
    stream = await client.chat.completions.create(pinnedParams);
  } catch (pinnedError) {
    // `allow_fallbacks: false` returns the upstream error instead of rerouting,
    // so a pinned outage has to be retried unpinned by the caller.
    console.warn(
      `[chat] pinned provider ${PINNED_PROVIDER} unavailable, retrying unpinned:`,
      pinnedError,
    );

    const fallbackParams: OpenRouterParams = {
      ...base,
      messages: withoutReasoningDetails(messages),
      stream: true,
    };
    stream = await client.chat.completions.create(fallbackParams);
  }

  const encoder = new TextEncoder();
  const streamToClose = stream;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const chunk of streamToClose) {
          const delta = chunk.choices[0]?.delta as OpenRouterDelta | undefined;
          if (!delta) continue;

          if (delta.reasoning) send("reasoning", delta.reasoning);
          if (delta.content) send("content", delta.content);
          if (delta.reasoning_details) send("reasoning_details", delta.reasoning_details);
        }
        send("done", null);
      } catch (streamError) {
        send("error", streamError instanceof Error ? streamError.message : String(streamError));
      } finally {
        controller.close();
      }
    },
    cancel() {
      streamToClose.controller.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
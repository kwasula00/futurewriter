import OpenAI from "openai";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const WRITER_MODEL = "deepseek/deepseek-v4.1-flash";

/**
 * `provider.only` is a hard allowlist, so pinning guarantees the reasoning
 * output stays on one endpoint and stays comparable between turns.
 */
export const PINNED_PROVIDER = "relace/fp4";

/**
 * The OpenAI SDK has no types for OpenRouter's `reasoning` and `provider`
 * fields, so they are declared here.
 */
export type OpenRouterParams = OpenAI.Chat.ChatCompletionCreateParamsStreaming & {
  reasoning?: { enabled: boolean };
  provider?: { only?: string[]; allow_fallbacks?: boolean };
};

/**
 * Assistant turns carry `reasoning_details` back to the model. The SDK type
 * does not include it, so messages are widened here.
 */
export type OpenRouterMessage = OpenAI.Chat.ChatCompletionMessageParam & {
  reasoning_details?: unknown;
};

/** Streaming delta plus the reasoning fields OpenRouter adds. */
export type OpenRouterDelta = {
  content?: string | null;
  reasoning?: string | null;
  reasoning_details?: unknown;
};

/** Minimal shape of the SDK's streaming response, without importing its path. */
export type ChatCompletionStream = AsyncIterable<OpenAI.Chat.ChatCompletionChunk> & {
  controller: AbortController;
};

export function createOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPEN_ROUTER_API_KEY is not set");
  }

  return new OpenAI({ baseURL: OPENROUTER_BASE_URL, apiKey });
}

/** Drops `reasoning_details`, which are only valid on the provider that produced them. */
export function withoutReasoningDetails(messages: OpenRouterMessage[]): OpenRouterMessage[] {
  return messages.map(({ reasoning_details: _reasoningDetails, ...rest }) => rest);
}
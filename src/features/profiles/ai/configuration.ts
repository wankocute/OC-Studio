import "server-only";
import type { ServerEnv } from "@/lib/env";
import { createGeminiWriter, GEMINI_FREE_MODEL } from "./gemini";
import { createOpenAiWriter } from "./provider";

type Configuration = Pick<
  ServerEnv,
  "AI_PROVIDER" | "GEMINI_API_KEY" | "GEMINI_MODEL" | "OPENAI_API_KEY" | "OPENAI_MODEL"
>;
export function aiConfiguration(env: Configuration) {
  return {
    provider: env.AI_PROVIDER,
    configured:
      env.AI_PROVIDER === "gemini"
        ? !!env.GEMINI_API_KEY && env.GEMINI_MODEL === GEMINI_FREE_MODEL
        : !!env.OPENAI_API_KEY && !!env.OPENAI_MODEL,
  };
}
export function createConfiguredWriter(env: Configuration, request: typeof fetch = fetch) {
  return env.AI_PROVIDER === "gemini"
    ? createGeminiWriter(env.GEMINI_API_KEY, env.GEMINI_MODEL, request)
    : createOpenAiWriter(env.OPENAI_API_KEY, env.OPENAI_MODEL, request);
}

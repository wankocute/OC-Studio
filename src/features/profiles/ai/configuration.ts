import "server-only";
import type { ServerEnv } from "@/lib/env";
import { createGeminiWriter, GEMINI_FREE_MODEL } from "./gemini";
import { createOpenAiWriter, type AiError } from "./provider";

type Configuration = Pick<
  ServerEnv,
  "AI_PROVIDER" | "GEMINI_API_KEY" | "GEMINI_MODEL" | "OPENAI_API_KEY" | "OPENAI_MODEL"
>;
export function aiConfiguration(env: Configuration) {
  const configurationIssues: AiError["code"][] = [];
  if (env.AI_PROVIDER === "gemini") {
    if (!env.GEMINI_API_KEY) configurationIssues.push("geminiKeyMissing");
    if (!env.GEMINI_MODEL) configurationIssues.push("geminiModelMissing");
    else if (env.GEMINI_MODEL !== GEMINI_FREE_MODEL)
      configurationIssues.push("geminiModelUnsupported");
  } else {
    if (!env.OPENAI_API_KEY) configurationIssues.push("openaiKeyMissing");
    if (!env.OPENAI_MODEL) configurationIssues.push("openaiModelMissing");
  }
  return {
    provider: env.AI_PROVIDER,
    configured: configurationIssues.length === 0,
    configurationIssues,
  };
}
export function createConfiguredWriter(env: Configuration, request: typeof fetch = fetch) {
  return env.AI_PROVIDER === "gemini"
    ? createGeminiWriter(env.GEMINI_API_KEY, env.GEMINI_MODEL, request)
    : createOpenAiWriter(env.OPENAI_API_KEY, env.OPENAI_MODEL, request);
}

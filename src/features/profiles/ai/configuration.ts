import "server-only";
import type { ServerEnv } from "@/lib/env";
import { createGeminiWriter } from "./gemini";
import { geminiModelInfo, parseGeminiAllowlist } from "./gemini-models";
import { AiError, createOpenAiWriter, type SectionWriter } from "./provider";

type Configuration = Pick<
  ServerEnv,
  | "AI_PROVIDER"
  | "GEMINI_API_KEY"
  | "GEMINI_MODEL"
  | "GEMINI_ALLOWED_MODELS"
  | "OPENAI_API_KEY"
  | "OPENAI_MODEL"
>;

/** A model the user may pick, as shown in the AI dialog. */
export type AiModelOption = { id: string; label: string; hint?: string };

export function aiConfiguration(env: Configuration) {
  const configurationIssues: AiError["code"][] = [];
  let models: AiModelOption[] = [];
  let defaultModel: string | undefined;
  if (env.AI_PROVIDER === "gemini") {
    const allowlist = parseGeminiAllowlist(env.GEMINI_ALLOWED_MODELS);
    if (!env.GEMINI_API_KEY) configurationIssues.push("geminiKeyMissing");
    if (allowlist.invalid.length > 0 || allowlist.models.length === 0)
      configurationIssues.push("geminiAllowlistInvalid");
    if (!env.GEMINI_MODEL) configurationIssues.push("geminiModelMissing");
    else if (!allowlist.models.includes(env.GEMINI_MODEL))
      configurationIssues.push("geminiModelUnsupported");
    models = allowlist.models.map((id) => {
      const { label, hint } = geminiModelInfo(id);
      return hint ? { id, label, hint } : { id, label };
    });
    defaultModel = env.GEMINI_MODEL;
  } else {
    if (!env.OPENAI_API_KEY) configurationIssues.push("openaiKeyMissing");
    if (!env.OPENAI_MODEL) configurationIssues.push("openaiModelMissing");
    if (env.OPENAI_MODEL) models = [{ id: env.OPENAI_MODEL, label: env.OPENAI_MODEL }];
    defaultModel = env.OPENAI_MODEL;
  }
  return {
    provider: env.AI_PROVIDER,
    configured: configurationIssues.length === 0,
    configurationIssues,
    models,
    defaultModel,
  };
}

/**
 * The model for one request: the requested id if it is in the allowlist, the configured default
 * when none was requested. The id a client sends is only ever compared with the allowlist; the
 * app never switches to another model on its own.
 */
export function resolveModel(env: Configuration, requested?: string): string {
  const configuration = aiConfiguration(env);
  if (!configuration.configured) throw new AiError(configuration.configurationIssues[0]!);
  const model = requested ?? configuration.defaultModel!;
  if (!configuration.models.some((option) => option.id === model)) {
    throw new AiError("modelNotAllowed");
  }
  return model;
}

export function createConfiguredWriter(
  env: Configuration,
  request: typeof fetch = fetch,
  model: string | undefined = env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
): SectionWriter {
  if (env.AI_PROVIDER !== "gemini") return createOpenAiWriter(env.OPENAI_API_KEY, model, request);
  // Defence in depth: a model outside the allowlist is refused here too, before any request.
  if (model && !parseGeminiAllowlist(env.GEMINI_ALLOWED_MODELS).models.includes(model)) {
    return {
      generate: async () => {
        throw new AiError("geminiModelUnsupported");
      },
    };
  }
  return createGeminiWriter(env.GEMINI_API_KEY, model, request);
}

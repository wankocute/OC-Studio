import "server-only";

/**
 * Gemini models the app knows how to call, and what each accepts.
 *
 * Checked against ai.google.dev on 2026-10-11:
 * - pricing: these models list text input/output as "Free of charge" in the Free Tier column;
 * - thinking: `thinkingLevel` is only sent where the documented levels include it. Flash-Lite
 *   models keep Google's default (minimal) — they are the speed-first choice.
 *
 * Being listed here — or in GEMINI_ALLOWED_MODELS — only limits what the app offers. It does not
 * prove the key's project is on the Free Tier: a project with billing enabled is charged.
 */
export type GeminiModelInfo = {
  id: string;
  label: string;
  /** Short note for the picker; never a promise about speed or quality. */
  hint?: string;
  /** `thinkingConfig.thinkingLevel` to send, or `undefined` to send no thinking config. */
  thinkingLevel?: "LOW";
};

const KNOWN_MODELS: readonly GeminiModelInfo[] = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", thinkingLevel: "LOW" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", thinkingLevel: "LOW" },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    hint: "Ưu tiên tốc độ",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    hint: "Ưu tiên tốc độ",
  },
];

/** Model ids look like `gemini-3.8-flash`: anything else in the configuration is rejected. */
export const GEMINI_MODEL_ID = /^gemini-[a-z0-9][a-z0-9.-]{0,79}$/;

/** What the app knows about a model id; unknown (but allowed) ids get no special parameters. */
export function geminiModelInfo(id: string): GeminiModelInfo {
  return KNOWN_MODELS.find((model) => model.id === id) ?? { id, label: id };
}

/** Default model when nothing else is configured. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";

/**
 * Parse GEMINI_ALLOWED_MODELS (comma-separated ids). When it is not set, the allowlist is the
 * models verified above, so an unknown GEMINI_MODEL is still refused unless explicitly listed.
 * Duplicates are dropped; order is kept.
 */
export function parseGeminiAllowlist(allowed: string | undefined): {
  models: string[];
  invalid: string[];
} {
  const ids = (allowed ?? KNOWN_MODELS.map((model) => model.id).join(","))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const unique = [...new Set(ids)];
  return {
    models: unique.filter((id) => GEMINI_MODEL_ID.test(id)),
    invalid: unique.filter((id) => !GEMINI_MODEL_ID.test(id)),
  };
}

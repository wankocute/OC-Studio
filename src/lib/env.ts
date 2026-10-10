import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  /** Comma-separated Gemini model ids the app may offer; GEMINI_MODEL must be one of them. */
  GEMINI_ALLOWED_MODELS: z.string().max(2_000).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  /** How long one AI request may take before the server aborts it (10 s – 15 min). */
  AI_REQUEST_TIMEOUT_MS: z.coerce
    .number({ error: "AI_REQUEST_TIMEOUT_MS phải là số mili giây." })
    .int("AI_REQUEST_TIMEOUT_MS phải là số nguyên.")
    .min(10_000, "AI_REQUEST_TIMEOUT_MS tối thiểu 10000 (10 giây).")
    .max(900_000, "AI_REQUEST_TIMEOUT_MS tối đa 900000 (15 phút).")
    .default(300_000),
  DATABASE_URL: z
    .url({
      protocol: /^postgres(ql)?$/,
      error: "DATABASE_URL phải là URL PostgreSQL hợp lệ (postgresql://...).",
    })
    .optional(),
  /** Directory for uploaded images (outside `public/`). Defaults to `<project>/storage`. */
  MEDIA_STORAGE_DIR: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class InvalidServerEnvError extends Error {
  constructor(details: string) {
    super(`Biến môi trường không hợp lệ:\n${details}`);
    this.name = "InvalidServerEnvError";
  }
}

/**
 * Validate server environment variables.
 * Blank values are treated as "not set", so `DATABASE_URL=` behaves like a missing variable.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const normalized = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value?.trim() || undefined]),
  );
  const result = serverEnvSchema.safeParse(normalized);
  if (!result.success) {
    throw new InvalidServerEnvError(z.prettifyError(result.error));
  }
  return result.data;
}

export function getServerEnv(): ServerEnv {
  // Next dev reloads process.env when .env.local changes; do not retain the first values.
  return parseServerEnv(process.env);
}

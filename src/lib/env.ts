import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
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

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}

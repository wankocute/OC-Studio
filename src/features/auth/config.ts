import "server-only";

import { messages } from "@/i18n";
import { getServerEnv, InvalidServerEnvError, type ServerEnv } from "@/lib/env";

import { deriveSigningKey } from "./session-token";

export type AuthConfig =
  | { status: "enabled"; password: string; signingKey: Buffer; secureCookie: boolean }
  /** Development/test only, when neither variable is set: no login screen. */
  | { status: "disabled" }
  /** Fail closed: every request is refused with `reason` (an operator-facing message). */
  | { status: "misconfigured"; reason: string };

/**
 * Production never runs without a password. Outside production, both variables blank keeps
 * `pnpm dev` working as before; setting only one of them is treated as a mistake everywhere.
 */
export function resolveAuthConfig(
  env: Pick<ServerEnv, "APP_PASSWORD" | "AUTH_SECRET" | "NODE_ENV">,
): AuthConfig {
  const { APP_PASSWORD: password, AUTH_SECRET: secret, NODE_ENV: nodeEnv } = env;
  if (password && secret) {
    return {
      status: "enabled",
      password,
      signingKey: deriveSigningKey(secret, password),
      secureCookie: nodeEnv === "production",
    };
  }
  if (!password && !secret && nodeEnv !== "production") return { status: "disabled" };

  const missing = [!password && "APP_PASSWORD", !secret && "AUTH_SECRET"].filter(
    (name): name is string => Boolean(name),
  );
  return { status: "misconfigured", reason: messages.auth.misconfigured(missing) };
}

/** Current config from `process.env`. An invalid environment also fails closed. */
export function loadAuthConfig(): AuthConfig {
  try {
    return resolveAuthConfig(getServerEnv());
  } catch (error) {
    if (error instanceof InvalidServerEnvError)
      return { status: "misconfigured", reason: error.message };
    throw error;
  }
}

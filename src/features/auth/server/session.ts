import "server-only";

import { cookies } from "next/headers";

import { messages } from "@/i18n";
import { type ActionError, fail } from "@/lib/action-result";

import type { AuthState } from "../access";
import { type AuthConfig, loadAuthConfig } from "../config";
import { SESSION_COOKIE } from "../constants";
import { createSessionToken, verifySessionToken } from "../session-token";

export function authStateFor(config: AuthConfig, token: string | undefined, now = Date.now()) {
  if (config.status !== "enabled") return config.status satisfies AuthState;
  return verifySessionToken(token, config.signingKey, now) ? "authenticated" : "anonymous";
}

/** Auth state of the current request (Server Actions, Route Handlers, Server Components). */
export async function getRequestAuthState(): Promise<AuthState> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return authStateFor(loadAuthConfig(), token);
}

/**
 * First line of every Server Action. The proxy already refuses anonymous POSTs, but action ids
 * are global — any route can invoke any action — so each action verifies the session itself.
 */
export async function rejectUnauthenticatedAction(): Promise<{
  ok: false;
  error: ActionError;
} | null> {
  const config = loadAuthConfig();
  if (config.status === "misconfigured") {
    return fail({ code: "unauthenticated", message: config.reason });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (authStateFor(config, token) === "anonymous") {
    return fail({ code: "unauthenticated", message: messages.auth.sessionExpired });
  }
  return null;
}

/** Same check for Route Handlers: a bare status, no body worth leaking. */
export async function rejectUnauthenticatedRequest(): Promise<Response | null> {
  const state = await getRequestAuthState();
  if (state === "misconfigured") return new Response(null, { status: 503 });
  if (state === "anonymous") {
    return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}

export async function startSession(config: Extract<AuthConfig, { status: "enabled" }>) {
  const { token, expiresAt } = createSessionToken(config.signingKey);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { messages } from "@/i18n";
import { type ActionResult, fail, failFromError, invalidInput } from "@/lib/action-result";

import { safeNextPath } from "./access";
import { loadAuthConfig } from "./config";
import { AUTH_LIMITS } from "./constants";
import { clientKeyFromHeaders, LoginRateLimiter } from "./rate-limit";
import { createLoginFailureStore } from "./server/login-failure-store";
import { startSession } from "./server/session";
import { passwordMatches } from "./session-token";

const loginSchema = z.object({
  password: z
    .string()
    .min(1, messages.auth.wrongPassword)
    .max(AUTH_LIMITS.maxPasswordLength, messages.auth.wrongPassword),
  next: z.string().nullish(),
});

/**
 * The only action that runs without a session. On success it sets the cookie and redirects
 * (it never returns `ok`); failures are counted per client and in total, in
 * Postgres so every serverless instance sees the same counters.
 */
export async function loginAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const config = loadAuthConfig();
  if (config.status === "misconfigured") {
    return fail({ code: "unauthenticated", message: config.reason });
  }
  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
    next: formData.get("next"),
  });
  const next = safeNextPath(parsed.data?.next) as Route;
  if (config.status === "disabled") redirect(next);
  if (!parsed.success) return invalidInput(parsed.error);

  const client = clientKeyFromHeaders(await headers());
  try {
    // Fails closed: without the counters (database down) no password is checked at all.
    const limiter = new LoginRateLimiter(createLoginFailureStore(getDb()));
    const check = await limiter.check(client);
    if (!check.allowed) {
      return fail({
        code: "rate_limited",
        message: messages.auth.tooManyAttempts(Math.ceil(check.retryAfterMs / 60_000)),
      });
    }

    if (!passwordMatches(parsed.data.password, config.password)) {
      await limiter.recordFailure(client);
      const message = messages.auth.wrongPassword;
      return fail({ code: "invalid_input", message, fieldErrors: { password: message } });
    }

    await limiter.reset(client);
  } catch (error) {
    console.error("[auth] login failure counters unavailable", error);
    return failFromError(error);
  }
  await startSession(config);
  redirect(next);
}

"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { messages } from "@/i18n";
import { type ActionResult, fail, invalidInput } from "@/lib/action-result";

import { safeNextPath } from "./access";
import { loadAuthConfig } from "./config";
import { AUTH_LIMITS } from "./constants";
import { clientKeyFromHeaders, getLoginRateLimiter } from "./rate-limit";
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
 * (it never returns `ok`); failures are counted per client and in total.
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

  const limiter = getLoginRateLimiter();
  const client = clientKeyFromHeaders(await headers());
  const check = limiter.check(client);
  if (!check.allowed) {
    return fail({
      code: "rate_limited",
      message: messages.auth.tooManyAttempts(Math.ceil(check.retryAfterMs / 60_000)),
    });
  }

  if (!passwordMatches(parsed.data.password, config.password)) {
    limiter.recordFailure(client);
    const message = messages.auth.wrongPassword;
    return fail({ code: "invalid_input", message, fieldErrors: { password: message } });
  }

  limiter.reset(client);
  await startSession(config);
  redirect(next);
}

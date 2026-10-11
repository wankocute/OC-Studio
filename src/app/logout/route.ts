import { cookies } from "next/headers";

import { LOGIN_PATH, SESSION_COOKIE } from "@/features/auth/constants";

/**
 * POST /logout — a plain form post (sidebar), so it works even after the session expired, when
 * Server Actions are already refused. Cross-site posts are rejected so no other site can sign
 * the user out.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && origin !== "null" && new URL(origin).host !== host) {
    return new Response(null, { status: 403 });
  }

  (await cookies()).delete(SESSION_COOKIE);
  return new Response(null, {
    status: 303,
    headers: { Location: LOGIN_PATH, "Cache-Control": "no-store" },
  });
}

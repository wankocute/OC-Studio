import { type NextRequest, NextResponse } from "next/server";

import { decideAccess } from "@/features/auth/access";
import { loadAuthConfig } from "@/features/auth/config";
import { SESSION_COOKIE } from "@/features/auth/constants";
import { authStateFor } from "@/features/auth/server/session";

/**
 * Gate in front of every route (pages, /api, /media, Server Action POSTs). Server Actions and
 * Route Handlers verify the session again on their own; this layer is not the only check.
 */
export function proxy(request: NextRequest) {
  const auth = loadAuthConfig();
  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
    auth: authStateFor(auth, request.cookies.get(SESSION_COOKIE)?.value),
  });

  switch (decision.type) {
    case "allow":
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(decision.location, request.url));
    case "unauthenticated":
      return new NextResponse(null, { status: 401, headers: { "Cache-Control": "no-store" } });
    case "misconfigured":
      return new NextResponse(auth.status === "misconfigured" ? auth.reason : null, {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
  }
}

export const config = {
  // Everything except build assets and the app icon (shown on the login page too), which are
  // public anyway and contain no user data.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};

import { AUTH_LIMITS, LOGIN_PATH, LOGOUT_PATH } from "./constants";

export type AuthState = "authenticated" | "anonymous" | "disabled" | "misconfigured";

export type AccessDecision =
  | { type: "allow" }
  | { type: "redirect"; location: string }
  | { type: "unauthenticated" }
  | { type: "misconfigured" };

type AccessRequest = { pathname: string; search: string; method: string; auth: AuthState };

/** Paths that answer with data or files, never a page: they get 401 instead of a redirect. */
function isPageNavigation({ pathname, method }: AccessRequest): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  return !["/api", "/media"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The proxy's decision for one request. Everything is private except the login page itself and
 * logout; Server Actions are POSTs, so an anonymous one is refused before it reaches the action
 * (each action checks again on its own — see `server/session.ts`).
 */
export function decideAccess(request: AccessRequest): AccessDecision {
  const { pathname, search, auth } = request;
  if (auth === "misconfigured") return { type: "misconfigured" };
  if (pathname === LOGIN_PATH) {
    return auth === "authenticated" || auth === "disabled"
      ? { type: "redirect", location: "/" }
      : { type: "allow" };
  }
  if (auth === "authenticated" || auth === "disabled" || pathname === LOGOUT_PATH) {
    return { type: "allow" };
  }
  if (!isPageNavigation(request)) return { type: "unauthenticated" };

  const target = `${pathname}${search}`;
  return {
    type: "redirect",
    location: target === "/" ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(target)}`,
  };
}

/**
 * Where to go after login: only same-origin absolute paths. Anything that could leave the site
 * (`//host`, `/\host`, schemes) or loop back to the auth pages falls back to the dashboard.
 */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > AUTH_LIMITS.maxNextPathLength) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // Control characters and backslashes can be normalized into another origin by browsers.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  const pathname = raw.split(/[?#]/, 1)[0];
  if (pathname === LOGIN_PATH || pathname === LOGOUT_PATH) return "/";
  return raw;
}

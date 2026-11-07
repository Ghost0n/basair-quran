import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";
const sessionCookieName = process.env.QBASAIR_SESSION_COOKIE_NAME || "qbasair_session";

const PUBLIC_PATH_PREFIXES = ["/_next", "/favicon.ico", "/apple-touch-icon.png"];

export function middleware(request: NextRequest) {
  if (!authEnabled) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Guest-first: unauthenticated visitors are NOT forced to /login. They reach
  // the app, where the client-side ShellGate shows the Landing (create account /
  // sign in / continue as guest); the backend hard-gates only the Studio surface.
  // One courtesy redirect remains: an already-authenticated visitor who lands on
  // /login is sent straight to the workspace — except on the way back from
  // Keycloak (`from=idp`), where the login page finishes signing in (onboarding,
  // guest data, then `next`; docs/keycloak.md).
  const hasSessionCookie = Boolean(request.cookies.get(sessionCookieName)?.value);
  if (hasSessionCookie && pathname === "/login" && request.nextUrl.searchParams.get("from") !== "idp") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

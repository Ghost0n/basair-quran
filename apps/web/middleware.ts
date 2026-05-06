import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";
const sessionCookieName = process.env.QBASAIR_SESSION_COOKIE_NAME || "qbasair_session";

const PUBLIC_PATH_PREFIXES = ["/_next", "/favicon.ico", "/apple-touch-icon.png"];

export function middleware(request: NextRequest) {
  if (!authEnabled) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const isLoginPage = pathname === "/login";
  const hasSessionCookie = Boolean(request.cookies.get(sessionCookieName)?.value);

  if (!hasSessionCookie && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

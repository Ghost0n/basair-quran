// Default to the SAME-ORIGIN "/api" path so the browser talks to the Next
// server, which proxies to the backend via the rewrite in next.config.ts
// (destination = QBASAIR_API_ORIGIN, default http://127.0.0.1:8001). This
// keeps the session cookie same-origin — an absolute cross-origin API URL
// (e.g. http://127.0.0.1:8001/api served from :3000) causes the browser to
// drop the httpOnly session cookie, so login "succeeds" but never sticks.
// Override with NEXT_PUBLIC_API_BASE_URL only for genuinely separate hosts.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "/api";
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";

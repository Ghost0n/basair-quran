/**
 * In the app build every `/api/*` request made by the web app goes through
 * here instead of a Next server:
 *
 * - Quran routes and the user's own data → answered on the device
 *   (packages/offline-engine), online or not;
 * - everything else (accounts, the research agent, Community) → the server at
 *   REMOTE_ORIGIN with the account's bearer token, when online; otherwise a
 *   503 the screens present as "needs a connection".
 *
 * The rest of the app keeps calling `fetch("/api/…")` as on the web.
 */
import { REMOTE_ORIGIN } from "./config";
import { appRuntime } from "./runtime";

const TOKEN_KEY = "qb.auth.token";
const SESSION_KEY = "qb.auth.session";

let token: string | null = null;
let nativeFetchRef: typeof fetch | null = null;

type AuthListener = (session: { authenticated?: boolean; user?: { id: number } | null } | null) => void;
const localWriteListeners = new Set<() => void>();
const authListeners = new Set<AuthListener>();

/** Called after the user's data changed on the device (account sync schedules a push). */
export function onLocalWrite(listener: () => void): () => void {
  localWriteListeners.add(listener);
  return () => localWriteListeners.delete(listener);
}

/** Called on sign-in (the session) and sign-out (null). */
export function onAuthChange(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

/** The account last seen on this device (offline too), or null. */
export async function cachedSession(): Promise<{ authenticated?: boolean; user?: { id: number } | null } | null> {
  const { platform } = await appRuntime();
  const raw = await platform.kv.get(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** One JSON request to the account's API (account sync). */
export async function remoteRequest(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!REMOTE_ORIGIN || !nativeFetchRef) throw new Error("no server configured");
  await loadToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await nativeFetchRef(`${REMOTE_ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "omit",
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
let tokenLoaded: Promise<void> | null = null;

async function loadToken(): Promise<void> {
  if (!tokenLoaded) {
    tokenLoaded = appRuntime()
      .then(({ platform }) => platform.kv.get(TOKEN_KEY))
      .then((value) => {
        token = value;
      })
      .catch(() => undefined);
  }
  return tokenLoaded;
}

export async function authToken(): Promise<string | null> {
  await loadToken();
  return token;
}

async function remember(key: string, value: string | null): Promise<void> {
  const { platform } = await appRuntime();
  if (value === null) await platform.kv.remove(key);
  else await platform.kv.set(key, value);
}

export const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function remote(nativeFetch: typeof fetch, path: string, method: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!REMOTE_ORIGIN || !isOnline()) {
    if (path === "/api/auth/session") {
      // Offline: the account last seen on this device (or none) — never a dead end.
      const { platform } = await appRuntime();
      const cached = await platform.kv.get(SESSION_KEY);
      return json(200, cached ? JSON.parse(cached) : { enabled: true, authenticated: false, user: null });
    }
    return json(503, { detail: "offline" });
  }
  await loadToken();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  const body = init?.body ?? (input instanceof Request && method !== "GET" && method !== "HEAD" ? await input.clone().text() : undefined);
  const response = await nativeFetch(`${REMOTE_ORIGIN}${path}`, { method, headers, body, credentials: "omit", signal: init?.signal });

  if (response.ok && (path === "/api/auth/login" || path === "/api/auth/signup" || path === "/api/auth/session")) {
    const session = (await response.clone().json()) as { token?: string | null; authenticated?: boolean };
    if (session.token) {
      token = session.token;
      await remember(TOKEN_KEY, token);
    }
    await remember(SESSION_KEY, JSON.stringify({ ...session, token: undefined }));
    if (path !== "/api/auth/session") authListeners.forEach((listener) => listener(session as never));
  }
  if (path === "/api/auth/logout" || (path === "/api/auth/session" && response.status === 401)) {
    token = null;
    await remember(TOKEN_KEY, null);
    await remember(SESSION_KEY, null);
    authListeners.forEach((listener) => listener(null));
  }
  return response;
}

let installed = false;

export function installFetchRouter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);
  nativeFetchRef = nativeFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.href);
    // Compare scheme + host, not `origin`: iOS serves the app from capacitor://localhost,
    // and a custom scheme's URL origin is the opaque "null".
    const sameOrigin = url.protocol === window.location.protocol && url.host === window.location.host;
    if (!sameOrigin || !url.pathname.startsWith("/api/")) return nativeFetch(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.pathname + url.search;
    const { api } = await appRuntime();
    if (api.handles(method, url.pathname)) {
      try {
        const answer = await api.handle({ method, url: path, body: await readBody(input, init) });
        if (answer) {
          if (method !== "GET" && answer.status < 300) localWriteListeners.forEach((listener) => listener());
          return json(answer.status, answer.body, answer.headers);
        }
      } catch (error) {
        console.error("offline engine", error);
        return json(500, { detail: "internal error" });
      }
    }
    return remote(nativeFetch, path, method, input, init);
  };
}

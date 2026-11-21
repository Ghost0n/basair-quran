import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const store = new Map<string, string>();
const handled = new Set(["GET /api/search-v2", "GET /api/notebook"]);

vi.mock("./runtime", () => ({
  appRuntime: async () => ({
    platform: {
      kv: {
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string) => void store.set(key, value),
        remove: async (key: string) => void store.delete(key),
      },
    },
    api: {
      handles: (method: string, path: string) => handled.has(`${method} ${path}`),
      handle: async ({ url }: { url: string }) => ({ status: 200, body: { local: url } }),
    },
  }),
}));

type Call = { url: string; init?: RequestInit };

const ISSUER = "https://auth.basair.example/realms/qbasair";
const KEYCLOAK_TOKENS = "qb.auth.oidc";
const ENDPOINTS = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
  revocation_endpoint: `${ISSUER}/protocol/openid-connect/revoke`,
};

/** Keycloak tokens as keycloak.ts keeps them (a desktop preview: the device store). */
function keycloakSignedIn(expiresAt: number) {
  store.set(KEYCLOAK_TOKENS, JSON.stringify({ endpoints: ENDPOINTS, accessToken: "kc-access-1", refreshToken: "kc-refresh-1", idToken: "kc-id-1", expiresAt }));
  store.set("qb.auth.session", JSON.stringify({ enabled: true, authenticated: true, user: { id: 7 } }));
}

async function setup(online = true, origin = "https://localhost", keycloak: (url: string) => Response | Promise<Response> = () => new Response("{}", { status: 200 })) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_REMOTE_ORIGIN = "https://basair.example";
  const calls: Call[] = [];
  const nativeFetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith(ISSUER)) return keycloak(String(url));
    if (String(url).endsWith("/api/auth/login")) return new Response(JSON.stringify({ authenticated: true, token: "tok-1" }), { status: 200 });
    return new Response(JSON.stringify({ remote: true }), { status: 200 });
  });
  // keycloak.ts reaches Keycloak with the webview's fetch outside a phone.
  vi.stubGlobal("fetch", nativeFetch);
  const base = new URL(`${origin}/`);
  // WebKit reports a custom scheme's page origin as "capacitor://localhost" while URL() says "null".
  const win = { fetch: nativeFetch, location: { href: base.href, origin, protocol: base.protocol, host: base.host } };
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { onLine: online });
  const { installFetchRouter } = await import("./fetch-router");
  installFetchRouter();
  return { fetch: win.fetch as typeof fetch, calls };
}

beforeEach(() => store.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_REMOTE_ORIGIN;
});

describe("the app's /api fetch router", () => {
  test("Quran routes and the user's data are answered on the device, online or not", async () => {
    const { fetch, calls } = await setup(false);
    const response = await fetch("/api/search-v2?q=x&mode=root");
    expect(await response.json()).toEqual({ local: "/api/search-v2?q=x&mode=root" });
    expect(calls).toEqual([]);
  });

  test("server-only routes go to the server with the account's bearer token", async () => {
    const { fetch, calls } = await setup(true);
    await fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.c", password: "x" }) });
    expect(store.get("qb.auth.token")).toBe("tok-1");
    await fetch("/api/research/agent", { method: "POST", body: "{}" });
    const last = calls[calls.length - 1];
    expect(last.url).toBe("https://basair.example/api/research/agent");
    expect(new Headers(last.init?.headers).get("Authorization")).toBe("Bearer tok-1");
    expect(last.init?.credentials).toBe("omit");
  });

  test("offline, server-only routes answer 503 and the session falls back to the last one seen", async () => {
    const { fetch, calls } = await setup(false);
    expect((await fetch("/api/community/feed")).status).toBe(503);
    const session = await (await fetch("/api/auth/session")).json();
    expect(session).toEqual({ enabled: true, authenticated: false, user: null });
    expect(calls).toEqual([]);
  });

  test("other origins and non-API paths are left alone", async () => {
    const { fetch, calls } = await setup(true);
    await fetch("https://everyayah.com/data/x/001001.mp3");
    await fetch("/offline/manifest.json");
    expect(calls.map((call) => call.url)).toEqual(["https://everyayah.com/data/x/001001.mp3", "/offline/manifest.json"]);
  });

  test("Keycloak: the account's access token goes to the server as Bearer", async () => {
    keycloakSignedIn(Date.now() + 300_000);
    const { fetch, calls } = await setup(true);
    await fetch("/api/research/agent", { method: "POST", body: "{}" });
    expect(new Headers(calls[calls.length - 1].init?.headers).get("Authorization")).toBe("Bearer kc-access-1");
  });

  test("Keycloak: an expiring access token is refreshed first", async () => {
    keycloakSignedIn(Date.now() + 5_000);
    const { fetch, calls } = await setup(true, "https://localhost", () =>
      new Response(JSON.stringify({ access_token: "kc-access-2", refresh_token: "kc-refresh-2", expires_in: 300 }), { status: 200 }),
    );
    await fetch("/api/community/feed");
    expect(calls.map((call) => call.url)).toEqual([ENDPOINTS.token_endpoint, "https://basair.example/api/community/feed"]);
    expect(String(calls[0].init?.body)).toContain("grant_type=refresh_token");
    expect(new Headers(calls[1].init?.headers).get("Authorization")).toBe("Bearer kc-access-2");
    expect(JSON.parse(store.get(KEYCLOAK_TOKENS) ?? "{}").refreshToken).toBe("kc-refresh-2");
  });

  test("Keycloak unreachable for a refresh: answered as offline, still signed in", async () => {
    keycloakSignedIn(Date.now() - 1_000);
    const { fetch } = await setup(true, "https://localhost", () => Promise.reject(new TypeError("network")));
    expect((await fetch("/api/community/feed")).status).toBe(503);
    expect(await (await fetch("/api/auth/session")).json()).toEqual({ enabled: true, authenticated: true, user: { id: 7 } });
    expect(store.has(KEYCLOAK_TOKENS)).toBe(true);
  });

  test("Keycloak refused the refresh: signed out on the device", async () => {
    keycloakSignedIn(Date.now() - 1_000);
    const { fetch, calls } = await setup(true, "https://localhost", () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await fetch("/api/community/feed");
    const last = calls[calls.length - 1];
    expect(last.url).toBe("https://basair.example/api/community/feed");
    expect(new Headers(last.init?.headers).get("Authorization")).toBeNull();
    expect(store.has(KEYCLOAK_TOKENS)).toBe(false);
    expect(store.has("qb.auth.session")).toBe(false);
  });

  test("Keycloak sign-out: revoked and ended at Keycloak, nothing sent to our server", async () => {
    keycloakSignedIn(Date.now() + 300_000);
    const { fetch, calls } = await setup(true);
    const session = await (await fetch("/api/auth/logout", { method: "POST" })).json();
    expect(session).toMatchObject({ authenticated: false, provider: "keycloak" });
    expect(session.logout_url).toBeUndefined();
    expect(calls.map((call) => call.url)).toEqual([ENDPOINTS.revocation_endpoint, ENDPOINTS.end_session_endpoint]);
    expect(String(calls[1].init?.body)).toContain("id_token_hint=kc-id-1");
    expect(store.has(KEYCLOAK_TOKENS)).toBe(false);
    expect(store.has("qb.auth.session")).toBe(false);
  });

  test("iOS: the app's capacitor:// origin is recognised, so /api stays on the device", async () => {
    const { fetch, calls } = await setup(false, "capacitor://localhost");
    const response = await fetch("/api/search-v2?q=x");
    expect(await response.json()).toEqual({ local: "/api/search-v2?q=x" });
    expect(calls).toEqual([]);
  });
});

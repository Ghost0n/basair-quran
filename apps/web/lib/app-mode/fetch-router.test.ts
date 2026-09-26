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

async function setup(online = true, origin = "https://localhost") {
  vi.resetModules();
  process.env.NEXT_PUBLIC_REMOTE_ORIGIN = "https://basair.example";
  const calls: Call[] = [];
  const nativeFetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/auth/login")) return new Response(JSON.stringify({ authenticated: true, token: "tok-1" }), { status: 200 });
    return new Response(JSON.stringify({ remote: true }), { status: 200 });
  });
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

  test("iOS: the app's capacitor:// origin is recognised, so /api stays on the device", async () => {
    const { fetch, calls } = await setup(false, "capacitor://localhost");
    const response = await fetch("/api/search-v2?q=x");
    expect(await response.json()).toEqual({ local: "/api/search-v2?q=x" });
    expect(calls).toEqual([]);
  });
});

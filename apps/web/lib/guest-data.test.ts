import { describe, expect, it } from "vitest";

import { MemoryStorage } from "@q-basair/offline-engine";

import { createGuestData } from "./guest-data";

const ORIGIN = "https://basair.test/";
const API = "https://basair.test/api";

type Call = { method: string; path: string; body?: unknown };

/** A tiny stand-in for our server: who is signed in, and what reached it. */
function fakeServer() {
  const calls: Call[] = [];
  let user: { id: number } | null = null;
  let nextId = 100;
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const nativeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "") + url.search;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === "/auth/session") return send(200, { authenticated: Boolean(user), user });
    if (path === "/auth/login") {
      user = { id: 7 };
      return send(200, { authenticated: true, user });
    }
    if (path.startsWith("/quran-page")) {
      return send(200, { found: true, ayahs: [{ ayah_id: 8, surah_id: 1, ayah: 2, surah: "الفاتحة", text: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ" }] });
    }
    if (!user) return send(401, { detail: { code: "auth_required", gate: "account" } });
    if (method === "POST") return send(200, { ...body, id: body?.id ?? nextId++, created_at: 1, updated_at: 1 });
    if (method === "GET" && path === "/user/preferences") return send(200, { theme: "light" });
    if (method === "GET") return send(200, []);
    return send(200, body ?? {});
  }) as typeof fetch;

  return { calls, nativeFetch, signIn: () => (user = { id: 7 }) };
}

function setup() {
  const server = fakeServer();
  const storage = new MemoryStorage();
  const guest = createGuestData({ nativeFetch: server.nativeFetch, apiBase: API, storage });
  const request = async (method: string, path: string, body?: unknown) => {
    const response = await guest.fetch(`${API}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }, ORIGIN);
    return { status: response.status, body: await response.json() };
  };
  return { server, storage, guest, request };
}

describe("a guest's own data on the web", () => {
  it("stays in the browser: the server never sees the guest's notebook or preferences", async () => {
    const { server, request } = setup();
    const saved = await request("POST", "/notebook", { ayah_id: 8, surah_id: 1, surah: "الفاتحة", ayah: 2, text: "نص" });
    expect(saved.status).toBe(200);
    expect((await request("GET", "/notebook")).body).toHaveLength(1);
    await request("PATCH", "/user/preferences", { theme: "light" });
    expect((await request("GET", "/user/preferences")).body.theme).toBe("light");
    // Only the session probe reached the server.
    expect(server.calls.map((call) => call.path)).toEqual(["/auth/session"]);
  });

  it("checks a research document's quoted ayahs against the server's text", async () => {
    const { request } = setup();
    const created = await request("POST", "/documents", {
      title: "بحث",
      sections: [
        {
          id: "s",
          kind: "ayahs",
          ayahs: [
            { mushaf_id: 2, surah_id: 1, ayah: 2, text: "" },
            { mushaf_id: 2, surah_id: 1, ayah: 2, text: "نص آخر" },
          ],
        },
      ],
      references: [],
      provenance: {},
    });
    expect(created.status).toBe(200);
    // An empty quote is filled from the server's text, with its ayah id; a misquote is reported.
    expect(created.body.sections[0].ayahs[0]).toMatchObject({ ayah_id: 8, text: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ" });
    expect(created.body.verification.issues.map((issue: { problem: string }) => issue.problem)).toEqual(["text_mismatch"]);
  });

  it("leaves everything else to the server (the Quran, the Community)", async () => {
    const { server, request } = setup();
    await request("GET", "/quran-page?mushaf=2&page=1");
    await request("POST", "/community/posts/x/like");
    // No session question either: only a guest's own data is answered here.
    expect(server.calls.map((call) => call.path)).toEqual(["/quran-page?mushaf=2&page=1", "/community/posts/x/like"]);
  });

  it("goes to the account once signed in", async () => {
    const { server, request } = setup();
    await request("POST", "/auth/login", { email: "a@b.c", password: "x" });
    await request("GET", "/notebook");
    expect(server.calls.at(-1)).toMatchObject({ method: "GET", path: "/notebook" });
  });

  it("moves to the account on sign-in, then leaves the browser", async () => {
    const { server, storage, guest, request } = setup();
    const theme = (await request("POST", "/themes", { name: "البصائر" })).body;
    await request("POST", "/notebook", { ayah_id: 8, surah_id: 1, surah: "الفاتحة", ayah: 2, text: "نص", theme_ids: [theme.id] });
    await request("PATCH", "/user/preferences", { theme: "dark" });

    expect(await guest.upload()).toBe(0); // not signed in: nothing moves
    server.signIn();
    expect(await guest.upload()).toBe(2);

    const posted = server.calls.filter((call) => call.method === "POST").map((call) => call.path);
    expect(posted).toEqual(["/themes", "/notebook"]);
    // The notebook item points at the account's theme id, not the browser's.
    const item = server.calls.find((call) => call.method === "POST" && call.path === "/notebook");
    expect((item?.body as { theme_ids: number[] }).theme_ids).toEqual([100]);
    // The account's preferences stay the account's.
    expect(server.calls.some((call) => call.method === "PATCH" && call.path === "/user/preferences")).toBe(false);
    // The browser keeps nothing of it.
    const left = JSON.parse((await storage.read()) ?? "{}");
    expect([left.notebook, left.themes]).toEqual([[], []]);
  });
});

/**
 * Two devices and one account. The "server" is a third LocalStore answering
 * the same routes (the parity suite holds it to the real server's behaviour).
 */
import { describe, expect, test } from "vitest";

import { LocalStore, MemoryStorage, handleLocal, isLocalRoute, trimTrailingSlashes } from "../src/local-store";
import type { QuranEngine } from "../src/quran";
import { forgetAccount, syncAccount, type Remote } from "../src/sync";

const quran = {
  getAyahVerse: async (_m: number, surah: number, ayah: number) =>
    surah === 1 && ayah === 1 ? { ayah_id: 1, mushaf_id: 2, surah: "الفاتحة", surah_id: 1, ayah: 1, text: "بِسْمِ ٱللَّهِ", global_index: 1, highlights: [] } : null,
} as unknown as QuranEngine;

let tick = 1_700_000_000;
const clock = () => (tick += 1);
const store = () => new LocalStore({ storage: new MemoryStorage(), quran, clock });

function remoteOf(server: LocalStore): Remote & { calls: string[] } {
  const calls: string[] = [];
  const remote = async (method: string, path: string, body?: unknown) => {
    calls.push(`${method} ${path}`);
    const answer = await handleLocal(server, method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
    return answer ?? { status: 404, body: { detail: "Not Found" } };
  };
  return Object.assign(remote, { calls });
}

const api = async (device: LocalStore, method: string, path: string, body?: unknown) => (await handleLocal(device, method, path, body))!.body as any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("account sync", () => {
  test("what one device saves offline reaches the other, with theme references intact", async () => {
    const server = store();
    const remote = remoteOf(server);
    const phone = store();
    const tablet = store();

    const theme = await api(phone, "POST", "/api/themes", { name: "صبر", color: "blue" });
    await api(phone, "PUT", `/api/themes/${theme.id}/board`, { board: { v: 1, nodes: [] } });
    await api(phone, "POST", "/api/notebook", { ayah_id: 5, mushaf_id: 2, note: "ملاحظة", theme_ids: [theme.id] });
    await api(phone, "POST", "/api/sessions", { id: "s-1", messages: [{ role: "user", content: "سؤال" }] });
    await api(phone, "POST", "/api/roots", { root_text: "رحم" });
    await api(phone, "POST", "/api/documents", { title: "بحث", sections: [{ id: "a", kind: "ayahs", ayahs: [{ surah_id: 1, ayah: 1 }] }] });
    await api(phone, "PATCH", "/api/user/preferences", { theme: "light", translations: ["quranenc:english_saheeh"] });

    const first = await syncAccount(phone, remote, 7);
    expect(first.pushed).toBe(6); // theme (with its board), ayah, session, root, document, preferences
    expect((await api(server, "GET", "/api/notebook"))[0].theme_ids).toHaveLength(1);

    await syncAccount(tablet, remote, 7);
    const [tabletTheme] = await api(tablet, "GET", "/api/themes");
    const [tabletItem] = await api(tablet, "GET", "/api/notebook");
    expect(tabletTheme.name).toBe("صبر");
    expect(tabletItem.theme_ids).toEqual([tabletTheme.id]); // translated to the tablet's own ids
    expect((await api(tablet, "GET", `/api/themes/${tabletTheme.id}`)).board).toEqual({ v: 1, nodes: [] });
    expect((await api(tablet, "GET", "/api/sessions/s-1")).messages).toHaveLength(1);
    expect((await api(tablet, "GET", "/api/roots")).map((root: { root_text: string }) => root.root_text)).toEqual(["رحم"]);
    const [document] = await api(tablet, "GET", "/api/documents");
    expect((await api(tablet, "GET", `/api/documents/${document.id}`)).sections[0].ayahs[0].text).toBe("بِسْمِ ٱللَّهِ");
    expect((await api(tablet, "GET", "/api/user/preferences")).theme).toBe("light");
  });

  test("edits and deletions travel both ways, and a quiet sync changes nothing", async () => {
    const server = store();
    const remote = remoteOf(server);
    const phone = store();
    const tablet = store();
    const theme = await api(phone, "POST", "/api/themes", { name: "شكر" });
    const item = await api(phone, "POST", "/api/notebook", { ayah_id: 9, theme_ids: [theme.id] });
    await syncAccount(phone, remote, 1);
    await syncAccount(tablet, remote, 1);

    const [tabletTheme] = await api(tablet, "GET", "/api/themes");
    await api(tablet, "PATCH", `/api/themes/${tabletTheme.id}`, { name: "الشكر" });
    const [tabletItem] = await api(tablet, "GET", "/api/notebook");
    await api(tablet, "DELETE", `/api/notebook/${tabletItem.id}`);
    await syncAccount(tablet, remote, 1);
    await syncAccount(phone, remote, 1);

    expect((await api(phone, "GET", "/api/themes"))[0].name).toBe("الشكر");
    expect(await api(phone, "GET", "/api/notebook")).toEqual([]);
    expect((await api(phone, "DELETE", `/api/notebook/${item.id}`)).deleted).toBe(false);

    remote.calls.length = 0;
    const quiet = await syncAccount(phone, remote, 1);
    expect(quiet.pushed + quiet.deleted).toBe(0);
    expect(remote.calls.every((call) => call.startsWith("GET"))).toBe(true);
  });

  test("another account never sees the previous account's data; signing out keeps only what was made here", async () => {
    const serverA = store();
    const serverB = store();
    const phone = store();
    await api(phone, "POST", "/api/roots", { root_text: "علم" });
    await syncAccount(phone, remoteOf(serverA), 1);
    expect(await api(phone, "GET", "/api/roots")).toHaveLength(1);

    await syncAccount(phone, remoteOf(serverB), 2);
    expect(await api(phone, "GET", "/api/roots")).toEqual([]);
    expect(await api(serverB, "GET", "/api/roots")).toEqual([]);

    await api(phone, "POST", "/api/roots", { root_text: "نور" });
    await syncAccount(phone, remoteOf(serverB), 2);
    await forgetAccount(phone);
    expect(await api(phone, "GET", "/api/roots")).toEqual([]);
    await api(phone, "POST", "/api/roots", { root_text: "هدي" });
    await forgetAccount(phone);
    expect((await api(phone, "GET", "/api/roots")).map((root: { root_text: string }) => root.root_text)).toEqual(["هدي"]);
  });

  test("a failed sync keeps the ids it already obtained (no duplicates on retry)", async () => {
    const server = store();
    const good = remoteOf(server);
    const phone = store();
    await api(phone, "POST", "/api/roots", { root_text: "رحم" });
    await api(phone, "POST", "/api/documents", { title: "x" });
    const flaky: Remote = async (method, path, body) => (path === "/api/documents" && method === "POST" ? { status: 503, body: {} } : good(method, path, body));
    await expect(syncAccount(phone, flaky, 3)).rejects.toThrow("503");
    await syncAccount(phone, good, 3);
    expect(await api(server, "GET", "/api/roots")).toHaveLength(1);
    expect(await api(server, "GET", "/api/documents")).toHaveLength(1);
  });
});

describe("local routes", () => {
  test("trailing slashes are trimmed in linear time", async () => {
    expect(trimTrailingSlashes("/api/roots///")).toBe("/api/roots");
    expect(trimTrailingSlashes("/api/roots")).toBe("/api/roots");
    expect(trimTrailingSlashes("///")).toBe("");
    expect(isLocalRoute("GET", "/api/roots/")).toBe(true);
    expect(isLocalRoute("GET", `/${"/".repeat(100_000)}x`)).toBe(false);
    const started = Date.now();
    trimTrailingSlashes(`${"/".repeat(200_000)}x${"/".repeat(200_000)}`);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

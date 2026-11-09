// @vitest-environment happy-dom
import { LocalStore, MemoryStorage, emptyState, type LocalState } from "@q-basair/offline-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, string>();
let store: LocalStore;
const shared: { name: string; text: string }[] = [];
let shareAnswer: "shared" | "cancelled" | null = "shared";

vi.mock("./runtime", () => ({
  appRuntime: async () => ({
    api: { store },
    platform: { kv: { get: async (key: string) => kv.get(key) ?? null, set: async (key: string, value: string) => void kv.set(key, value) } },
  }),
}));
vi.mock("@/lib/native-share", () => ({
  nativeShareFiles: async (files: { blob: Blob; name: string }[]) => {
    for (const file of files) shared.push({ name: file.name, text: await file.blob.text() });
    return shareAnswer;
  },
}));

import { BackupError, makeBackup, parseBackup, restoreBackup, saveBackup } from "./backup";

function stateWith(notes: number, account: number | null = null): LocalState {
  const state = emptyState();
  state.notebook = Array.from({ length: notes }, (_, index) => ({ id: index + 1, ayah_id: 100 + index }));
  state.sessions = [{ id: "s1", title: "صبر", messages: [] }];
  state.account = account;
  return state;
}

beforeEach(() => {
  kv.clear();
  shared.length = 0;
  shareAnswer = "shared";
});

describe("guest backups (iCloud Drive / Google Drive)", () => {
  it("saves the device's whole data store as one file through the share sheet", async () => {
    store = new LocalStore({ storage: new MemoryStorage(JSON.stringify(stateWith(3))) } as never);
    expect(await saveBackup("Basair")).toBe("saved");
    expect(shared).toHaveLength(1);
    expect(shared[0].name).toMatch(/^basair-\d{4}-\d{2}-\d{2}\.json$/);
    const backup = parseBackup(shared[0].text);
    expect(backup.counts).toMatchObject({ notebook: 3, sessions: 1 });
    expect(backup.data.notebook[2]).toEqual({ id: 3, ayah_id: 102 });
  });

  it("reports a closed sheet", async () => {
    store = new LocalStore({ storage: new MemoryStorage(null) } as never);
    shareAnswer = "cancelled";
    expect(await saveBackup("Basair")).toBe("cancelled");
  });

  it("refuses a file that isn't a backup, or comes from a newer app", () => {
    expect(() => parseBackup("not json")).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ format: "other" }))).toThrow("not-a-backup");
    const newer = { ...makeBackup(stateWith(1)), version: 2 };
    expect(() => parseBackup(JSON.stringify(newer))).toThrow("newer-version");
    const broken = makeBackup(stateWith(1)) as unknown as { data: { notebook: unknown } };
    broken.data.notebook = "x";
    expect(() => parseBackup(JSON.stringify(broken))).toThrow("not-a-backup");
  });

  it("restores a backup in place of the device's data, keeping what was there and the device's account link", async () => {
    const storage = new MemoryStorage(JSON.stringify(stateWith(1, 7)));
    store = new LocalStore({ storage } as never);
    const events: unknown[] = [];
    window.addEventListener("qb:data-synced", (event) => events.push((event as CustomEvent).detail));
    await restoreBackup(parseBackup(JSON.stringify(makeBackup(stateWith(5, 99)))));
    const now = await store.snapshot();
    expect(now.notebook).toHaveLength(5);
    expect(now.account).toBe(7);
    expect(JSON.parse(kv.get("qb.userdata.before-restore") as string).counts.notebook).toBe(1);
    expect(events).toHaveLength(1);
    expect(JSON.parse((await storage.read()) as string).notebook).toHaveLength(5);
  });
});

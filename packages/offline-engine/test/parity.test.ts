/**
 * Parity with the server: replays the requests recorded by
 * scripts/offline_parity.py against the engine, on the same database, and
 * requires the same status and the same JSON. Without recorded cases the
 * suite is skipped (see the script's docstring for how to record them).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { MemoryStorage } from "../src/local-store";
import { OfflineApi } from "../src/router";
import { openNodeDriver } from "./node-driver";

type Case = { method: string; url: string; body?: unknown; status: number; json: unknown; clock: number; user_data?: boolean; capture?: string };
type Recorded = { quran_db: string; translations_db: string | null; mushaf: number; cases: Case[] };

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.QBASAIR_PARITY_CASES ?? path.resolve(here, "../../../build/offline-parity/cases.json");
const recorded: Recorded | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : null;

describe.skipIf(!recorded)(`server parity (${recorded ? `${recorded.cases.length} recorded requests` : "no recorded cases"})`, () => {
  test("every recorded request gets the server's status and JSON", async () => {
    const { quran_db, translations_db, cases } = recorded!;
    let now = 0;
    const api = new OfflineApi({
      quran: openNodeDriver(quran_db),
      translations: translations_db ? openNodeDriver(translations_db) : null,
      userData: new MemoryStorage(),
      clock: () => now,
    });
    const captures: Record<string, string> = {};
    const mismatches: string[] = [];
    for (const item of cases) {
      now = item.clock;
      const url = item.user_data ? item.url.replace(/\{(\w+)\}/g, (_, name: string) => captures[name] ?? name) : item.url;
      const response = await api.handle({ method: item.method, url, body: item.body });
      const label = `${item.method} ${decodeURIComponent(item.url)}`;
      if (response && item.capture && response.status === 200) captures[item.capture] = (response.body as { id: string }).id;
      if (response && item.user_data) response.body = maskIds(response.body, captures);
      if (response === null) {
        mismatches.push(`${label}: not handled offline`);
        continue;
      }
      if (response.status !== item.status) {
        mismatches.push(`${label}: status ${response.status}, server ${item.status}`);
        continue;
      }
      // FastAPI's validation messages are its own wording: statuses must match, bodies only otherwise.
      if (item.status === 422 && Array.isArray((item.json as { detail?: unknown }).detail)) continue;
      const actual = JSON.parse(JSON.stringify(response.body));
      // FastAPI's own validation errors are compared by status only (see above); ours carry the same shape.
      try {
        expect(actual).toEqual(item.json);
      } catch {
        mismatches.push(`${label}:\n  engine ${JSON.stringify(actual).slice(0, 600)}\n  server ${JSON.stringify(item.json).slice(0, 600)}`);
      }
    }
    expect(mismatches.slice(0, 15).join("\n\n"), `${mismatches.length} of ${cases.length} requests differ`).toBe("");
  }, 600_000);
});

/** Random document ids are compared by the name they were captured under. */
function maskIds(value: unknown, captures: Record<string, string>): unknown {
  const names = new Map(Object.entries(captures).map(([name, id]) => [id, `{${name}}`]));
  const walk = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, walk(entry)]));
    return typeof item === "string" && names.has(item) ? names.get(item) : item;
  };
  return walk(value);
}

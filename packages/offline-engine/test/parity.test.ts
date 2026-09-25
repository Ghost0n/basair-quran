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

import { OfflineApi } from "../src/router";
import { openNodeDriver } from "./node-driver";

type Case = { method: string; url: string; body?: unknown; status: number; json: unknown };
type Recorded = { quran_db: string; translations_db: string | null; mushaf: number; cases: Case[] };

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.QBASAIR_PARITY_CASES ?? path.resolve(here, "../../../build/offline-parity/cases.json");
const recorded: Recorded | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : null;

describe.skipIf(!recorded)(`server parity (${recorded ? `${recorded.cases.length} recorded requests` : "no recorded cases"})`, () => {
  test("every recorded request gets the server's status and JSON", async () => {
    const { quran_db, translations_db, cases } = recorded!;
    const api = new OfflineApi({ quran: openNodeDriver(quran_db), translations: translations_db ? openNodeDriver(translations_db) : null });
    const mismatches: string[] = [];
    for (const item of cases) {
      const response = await api.handle({ method: item.method, url: item.url, body: item.body });
      const label = `${item.method} ${decodeURIComponent(item.url)}`;
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
      try {
        expect(actual).toEqual(item.json);
      } catch {
        mismatches.push(`${label}:\n  engine ${JSON.stringify(actual).slice(0, 600)}\n  server ${JSON.stringify(item.json).slice(0, 600)}`);
      }
    }
    expect(mismatches.slice(0, 15).join("\n\n"), `${mismatches.length} of ${cases.length} requests differ`).toBe("");
  }, 600_000);
});

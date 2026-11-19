import { createHash } from "node:crypto";

import initSqlJs, { type Database } from "sql.js";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { Row, SqlValue } from "@q-basair/offline-engine";

import { PackError, PackManager, interfaceKey, type Manifest } from "./packs";
import { type DeviceDatabase, type DevicePlatform, PACK_META_TABLES, TRANSLATIONS_SCHEMA, insertStatements } from "./platform";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const rows = (db: Database, sql: string, params: SqlValue[] = []): Row[] => {
  const statement = db.prepare(sql);
  statement.bind(params);
  const out: Row[] = [];
  while (statement.step()) out.push(statement.getAsObject() as Row);
  statement.free();
  return out;
};

/** The device database contract, on sql.js (what the Android and browser platforms implement). */
function device(db: Database): DeviceDatabase {
  const transaction = async (statements: { sql: string; params?: SqlValue[] }[]) => {
    db.run("BEGIN");
    try {
      statements.forEach((statement) => db.run(statement.sql, statement.params ?? []));
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
  };
  return {
    all: async (sql, params = []) => rows(db, sql, params),
    run: async (sql, params = []) => void db.run(sql, params),
    transaction,
    async importPack(bytes) {
      const pack = new SQL.Database(bytes);
      const counts: Record<string, number> = {};
      const statements = [];
      for (const { name } of rows(pack, "SELECT name FROM sqlite_master WHERE type = 'table'")) {
        if (PACK_META_TABLES.has(String(name))) continue;
        const columns = rows(pack, `PRAGMA table_info("${name}")`).map((column) => String(column.name));
        const data = (pack.exec(`SELECT * FROM "${name}"`)[0]?.values ?? []) as SqlValue[][];
        counts[String(name)] = data.length;
        statements.push(...insertStatements(String(name), columns, data));
      }
      pack.close();
      await transaction(statements);
      return counts;
    },
    removePack: async (_id, statements) => transaction(statements),
  };
}

const QURAN_SCHEMA = `
  CREATE TABLE ayahs (id INTEGER PRIMARY KEY, mushaf_id INTEGER, surah_id INTEGER, number_in_surah INTEGER, text_uthmani TEXT);
  CREATE TABLE ayah_words (ayah_id INTEGER, mushaf_id INTEGER, word_position INTEGER, word_text TEXT, word_simple TEXT);
  CREATE TABLE word_occurrences (id INTEGER PRIMARY KEY, root_id INTEGER, ayah_id INTEGER, word_position INTEGER);`;

function narrationPack(): Uint8Array {
  const db = new SQL.Database();
  db.exec(QURAN_SCHEMA);
  db.exec("CREATE TABLE pack_info (name TEXT PRIMARY KEY, value TEXT)");
  db.run("INSERT INTO ayahs VALUES (10, 3, 1, 1, 'x'), (11, 3, 1, 2, 'y')");
  db.run("INSERT INTO ayah_words VALUES (10, 3, 1, 'x', 'x'), (11, 3, 1, 'y', 'y')");
  db.run("INSERT INTO word_occurrences VALUES (100, 1, 10, 1)");
  db.run("INSERT INTO pack_info VALUES ('kind', 'narration')");
  return db.export();
}

function translationPack(): Uint8Array {
  const db = new SQL.Database();
  TRANSLATIONS_SCHEMA.forEach((sql) => db.exec(sql));
  db.run(
    "INSERT INTO translations VALUES ('quranenc:french_montada', 'fr', 'translation', 'Montada', 'Montada', '', 'quranenc', 'https://quranenc.com', 'terms', 'v1', 'ltr', 1, 0)",
  );
  db.run("INSERT INTO translation_ayahs VALUES ('quranenc:french_montada', 1, 1, 'Au nom d''Allah', NULL)");
  return db.export();
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function setup(files: Record<string, Uint8Array>, overrides: Partial<Record<string, string>> = {}) {
  const store = new Map<string, string>();
  const quran = new SQL.Database();
  quran.exec(QURAN_SCHEMA);
  quran.run("INSERT INTO ayahs VALUES (1, 2, 1, 1, 'core')");
  const translations = new SQL.Database();
  TRANSLATIONS_SCHEMA.forEach((sql) => translations.exec(sql));
  const platform: DevicePlatform = {
    name: "web",
    kv: {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => void store.set(key, value),
      remove: async (key) => void store.delete(key),
    },
    files: { write: async () => {}, url: async () => null, remove: async () => {}, size: async () => 0 },
    openQuran: async () => device(quran),
    openTranslations: async () => device(translations),
  };
  const manifest: Manifest = {
    format: 1,
    generated_at: "2026-09-25T00:00:00+00:00",
    core: { id: "core", kind: "core" },
    packs: [
      { id: "narration-3", kind: "narration", file: "narration-3.db", size: files["narration-3.db"].length, sha256: overrides.narration ?? sha(files["narration-3.db"]), version: "n1", mushaf_id: 3 },
      { id: "translation-fr", kind: "translation", file: "translation-fr.db", size: files["translation-fr.db"].length, sha256: sha(files["translation-fr.db"]), version: "t1", key: "quranenc:french_montada", language: "fr" },
      { id: "interface-fr", kind: "interface", file: "interface-fr.json", size: files["interface-fr.json"].length, sha256: sha(files["interface-fr.json"]), version: "i1", language: "fr" },
    ],
    languages: [{ code: "fr", native: "Français", dir: "ltr", interface: "interface-fr", translation: "translation-fr" }],
  };
  vi.stubGlobal("fetch", async (url: string) => {
    const name = String(url).split("/").pop()!;
    if (name === "manifest.json") return new Response(JSON.stringify(manifest));
    return files[name] ? new Response(new Uint8Array(files[name])) : new Response("missing", { status: 404 });
  });
  const api = { reset: vi.fn() };
  const manager = new PackManager(platform, device(quran), device(translations), api as never);
  return { manager, quran, translations, store, api, manifest };
}

const files = () => ({
  "narration-3.db": narrationPack(),
  "translation-fr.db": translationPack(),
  "interface-fr.json": new TextEncoder().encode('{"x": "y"}'),
});

afterEach(() => vi.unstubAllGlobals());

describe("PackManager", () => {
  test("installs a narration into the device database, then removes exactly its rows", async () => {
    const { manager, quran, api, manifest } = setup(files());
    await manager.install(manifest.packs[0]);
    expect(rows(quran, "SELECT COUNT(*) AS n FROM ayahs WHERE mushaf_id = 3")[0].n).toBe(2);
    expect(rows(quran, "SELECT COUNT(*) AS n FROM word_occurrences")[0].n).toBe(1);
    expect(Object.keys(await manager.installed())).toEqual(["narration-3"]);
    expect(api.reset).toHaveBeenCalled();

    await manager.remove("narration-3");
    expect(rows(quran, "SELECT mushaf_id FROM ayahs")).toEqual([{ mushaf_id: 2 }]); // the core stays
    expect(rows(quran, "SELECT COUNT(*) AS n FROM word_occurrences")[0].n).toBe(0);
    expect(await manager.installed()).toEqual({});
  });

  test("refuses a pack whose checksum does not match, writing nothing", async () => {
    const { manager, quran, manifest } = setup(files(), { narration: "0".repeat(64) });
    await expect(manager.install(manifest.packs[0])).rejects.toBeInstanceOf(PackError);
    expect(rows(quran, "SELECT COUNT(*) AS n FROM ayahs WHERE mushaf_id = 3")[0].n).toBe(0);
    expect(await manager.installed()).toEqual({});
  });

  test("one language choice installs its interface and its translation", async () => {
    const { manager, translations, store } = setup(files());
    expect(await manager.installLanguage("fr")).toBe("quranenc:french_montada");
    expect(store.get(interfaceKey("fr"))).toBe('{"x": "y"}');
    expect(rows(translations, "SELECT text FROM translation_ayahs")[0].text).toBe("Au nom d'Allah");
    // Installing again with the same versions downloads nothing new.
    await manager.installLanguage("fr");
    expect(rows(translations, "SELECT COUNT(*) AS n FROM translation_ayahs")[0].n).toBe(1);
  });

  test("an installed pack whose catalogue version changed is offered as an update", async () => {
    const { manager, manifest } = setup(files());
    await manager.install(manifest.packs[1]);
    expect(await manager.updates()).toEqual([]);
    manifest.packs[1].version = "t2";
    await manager.catalogue(true);
    expect((await manager.updates()).map((pack) => pack.id)).toEqual(["translation-fr"]);
  });

  test("reconcile forgets packs whose data is gone, so they can be downloaded again", async () => {
    const { manager, quran, manifest } = setup(files());
    await manager.install(manifest.packs[0]);
    await manager.install(manifest.packs[2]);
    expect(await manager.reconcile()).toEqual([]);
    quran.run("DELETE FROM ayahs WHERE mushaf_id = 3"); // e.g. the core was replaced and the kept copy purged
    expect(await manager.reconcile()).toEqual(["narration-3"]);
    expect(Object.keys(await manager.installed())).toEqual(["interface-fr"]);
  });
});

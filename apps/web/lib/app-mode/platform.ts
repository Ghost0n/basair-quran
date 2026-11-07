import type { SqlDriver, SqlValue } from "@q-basair/offline-engine";

/**
 * What the app needs from the device. Android and iOS implement it with native
 * SQLite and the filesystem (platform-capacitor.ts); a desktop browser previewing the
 * app build uses sql.js and IndexedDB (platform-web.ts).
 */
export interface DeviceDatabase extends SqlDriver {
  /** A statement that changes data (INSERT/UPDATE/DELETE/DDL). */
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** Copy every row of every data table of a downloaded pack database into this one, in one transaction. */
  importPack(bytes: Uint8Array, id: string): Promise<Record<string, number>>;
  /** Remove an installed pack's rows (its delete statements, in one transaction). */
  removePack(id: string, statements: { sql: string; params?: SqlValue[] }[]): Promise<void>;
  /** Several statements in one transaction. */
  transaction(statements: { sql: string; params?: SqlValue[] }[]): Promise<void>;
}

export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface FileStore {
  write(path: string, bytes: Uint8Array): Promise<void>;
  /** A URL the webview can load (an <audio> src), or null when the file is absent. */
  url(path: string): Promise<string | null>;
  remove(prefix: string): Promise<void>;
  /** Total bytes stored under a prefix. */
  size(prefix: string): Promise<number>;
  /** Download a URL straight to a file (native: no CORS, no round trip through JS); returns its size. */
  download?(url: string, path: string): Promise<number>;
}

export interface DevicePlatform {
  readonly name: "android" | "ios" | "web";
  /** core.db (bundled) plus every installed narration pack. */
  openQuran(): Promise<DeviceDatabase>;
  /** Installed translation packs, merged (created empty on first launch). */
  openTranslations(): Promise<DeviceDatabase>;
  readonly kv: KeyValue;
  readonly files: FileStore;
}

/** Tables a pack carries besides its data. */
export const PACK_META_TABLES = new Set(["pack_info", "sqlite_sequence"]);

export const TRANSLATIONS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS translations (key TEXT PRIMARY KEY, language TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'translation',
    name TEXT NOT NULL, translator TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, source_url TEXT NOT NULL,
    terms TEXT NOT NULL, version TEXT NOT NULL, direction TEXT NOT NULL, ayah_count INTEGER NOT NULL, fetched_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS translation_ayahs (key TEXT NOT NULL, surah INTEGER NOT NULL, ayah INTEGER NOT NULL, text TEXT NOT NULL,
    footnotes TEXT, PRIMARY KEY (key, surah, ayah)) WITHOUT ROWID`,
];

/** INSERT statements (batched) copying `rows` of one table. */
export function insertStatements(table: string, columns: string[], rows: SqlValue[][], batch = 200): { sql: string; params: SqlValue[] }[] {
  const statements: { sql: string; params: SqlValue[] }[] = [];
  const tuple = `(${columns.map(() => "?").join(", ")})`;
  for (let start = 0; start < rows.length; start += batch) {
    const chunk = rows.slice(start, start + batch);
    statements.push({
      sql: `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${chunk.map(() => tuple).join(", ")}`,
      params: chunk.flat(),
    });
  }
  return statements;
}

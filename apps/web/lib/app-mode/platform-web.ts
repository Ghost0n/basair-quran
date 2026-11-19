/**
 * The app build running in a plain browser (desktop preview, end-to-end tests):
 * SQLite through sql.js (WebAssembly), everything else in IndexedDB. The
 * bundled core database is fetched from the export; installed packs are kept
 * as downloaded and re-applied on start, so the preview behaves like the phone.
 */
import type { Database } from "sql.js";

import type { Row, SqlValue } from "@q-basair/offline-engine";

import { CORE_DB_ASSET } from "./config";
import { loadSqlJs, packStatements, sqlRows as rows } from "./pack-reader";
import { type DeviceDatabase, type DevicePlatform, type FileStore, type KeyValue, TRANSLATIONS_SCHEMA } from "./platform";

const DB_NAME = "qbasair-app";
const STORES = ["kv", "packs", "files"] as const;
type StoreName = (typeof STORES)[number];

let idb: Promise<IDBDatabase> | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (!idb) {
    idb = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => STORES.forEach((store) => request.result.createObjectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return idb;
}

async function idbCall<T>(store: StoreName, mode: IDBTransactionMode, action: (objects: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

const kv: KeyValue = {
  get: async (key) => (await idbCall<string | undefined>("kv", "readonly", (store) => store.get(key))) ?? null,
  set: async (key, value) => void (await idbCall("kv", "readwrite", (store) => store.put(value, key))),
  remove: async (key) => void (await idbCall("kv", "readwrite", (store) => store.delete(key))),
};

const objectUrls = new Map<string, string>();

const files: FileStore = {
  write: async (path, bytes) => void (await idbCall("files", "readwrite", (store) => store.put(new Blob([bytes]), path))),
  url: async (path) => {
    const cached = objectUrls.get(path);
    if (cached) return cached;
    const blob = await idbCall<Blob | undefined>("files", "readonly", (store) => store.get(path));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.set(path, url);
    return url;
  },
  remove: async (prefix) => {
    const keys = await idbCall<IDBValidKey[]>("files", "readonly", (store) => store.getAllKeys());
    for (const key of keys) if (String(key).startsWith(prefix)) await idbCall("files", "readwrite", (store) => store.delete(key));
  },
  size: async (prefix) => {
    const keys = await idbCall<IDBValidKey[]>("files", "readonly", (store) => store.getAllKeys());
    let total = 0;
    for (const key of keys) {
      if (!String(key).startsWith(prefix)) continue;
      total += (await idbCall<Blob>("files", "readonly", (store) => store.get(key))).size;
    }
    return total;
  },
};

class WebDatabase implements DeviceDatabase {
  constructor(private readonly db: Database, private readonly scope: string) {}

  async all(sql: string, params: SqlValue[] = []): Promise<Row[]> {
    return rows(this.db, sql, params);
  }

  async run(sql: string, params: SqlValue[] = []): Promise<void> {
    this.db.run(sql, params);
  }

  async transaction(statements: { sql: string; params?: SqlValue[] }[]): Promise<void> {
    this.db.run("BEGIN");
    try {
      for (const statement of statements) this.db.run(statement.sql, statement.params ?? []);
      this.db.run("COMMIT");
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  /** Copy a pack's rows in, then keep its bytes so the next start re-applies it. */
  async importPack(bytes: Uint8Array<ArrayBuffer>, id: string): Promise<Record<string, number>> {
    const counts = await this.copyFrom(bytes);
    await idbCall("packs", "readwrite", (store) => store.put(bytes, `${this.scope}:${id}`));
    return counts;
  }

  async removePack(id: string, statements: { sql: string; params?: SqlValue[] }[]): Promise<void> {
    await this.transaction(statements);
    await idbCall("packs", "readwrite", (store) => store.delete(`${this.scope}:${id}`));
  }

  async copyFrom(bytes: Uint8Array): Promise<Record<string, number>> {
    const { statements, counts } = await packStatements(bytes);
    await this.transaction(statements);
    return counts;
  }

  /** Re-apply the packs installed in earlier sessions. */
  async replayPacks(): Promise<void> {
    const keys = await idbCall<IDBValidKey[]>("packs", "readonly", (store) => store.getAllKeys());
    for (const key of keys) {
      if (!String(key).startsWith(`${this.scope}:`)) continue;
      const bytes = await idbCall<Uint8Array>("packs", "readonly", (store) => store.get(key));
      await this.copyFrom(bytes);
    }
  }
}

export async function createWebPlatform(): Promise<DevicePlatform> {
  const SQL = await loadSqlJs();
  return {
    name: "web",
    kv,
    files,
    async openQuran() {
      const response = await fetch(CORE_DB_ASSET);
      if (!response.ok) throw new Error(`core database missing (${response.status})`);
      const database = new WebDatabase(new SQL.Database(new Uint8Array(await response.arrayBuffer())), "quran");
      await database.replayPacks();
      return database;
    },
    async openTranslations() {
      const database = new WebDatabase(new SQL.Database(), "translations");
      for (const sql of TRANSLATIONS_SCHEMA) await database.run(sql);
      await database.replayPacks();
      return database;
    },
  };
}

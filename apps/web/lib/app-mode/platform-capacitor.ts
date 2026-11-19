/**
 * Android and iOS: native SQLite (@capacitor-community/sqlite) for the databases,
 * the app's private storage (@capacitor/filesystem) for settings, the user's
 * data, installed packs and recitations.
 *
 * The bundled core database ships in the web assets
 * (assets/databases/coreSQLite.db) and is copied into the app's databases on
 * first launch. When an app update brings a new core (its version file
 * differs), the copy is replaced and the installed narration packs — kept as
 * downloaded — are applied again, so an update never loses a download.
 */
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";

import type { Row, SqlValue } from "@q-basair/offline-engine";

import { type DeviceDatabase, type DevicePlatform, type FileStore, type KeyValue, TRANSLATIONS_SCHEMA } from "./platform";
import { packStatements } from "./pack-reader";

const DATA = Directory.Data;
/**
 * Downloaded packs and recitations can always be fetched again, so on iOS they
 * live in Library/Caches, which iCloud does not back up (App Store rule). The
 * system may purge it: recitations then stream again, and the pack registry
 * reconciles with the database at start (PackManager.reconcile).
 */
const BULK = Capacitor.getPlatform() === "ios" ? Directory.Cache : Directory.Data;
const CORE_VERSION_KEY = "qb.core.version";
const sqlite = new SQLiteConnection(CapacitorSQLite);

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const exists = (path: string, directory: Directory) =>
  Filesystem.stat({ path, directory }).then(
    () => true,
    () => false,
  );

const kvPath = (key: string) => `kv/${encodeURIComponent(key)}.json`;

const kv: KeyValue = {
  async get(key) {
    try {
      const { data } = await Filesystem.readFile({ path: kvPath(key), directory: DATA, encoding: Encoding.UTF8 });
      return typeof data === "string" ? data : await data.text();
    } catch {
      return null;
    }
  },
  async set(key, value) {
    await Filesystem.writeFile({ path: kvPath(key), directory: DATA, data: value, encoding: Encoding.UTF8, recursive: true });
  },
  async remove(key) {
    await Filesystem.deleteFile({ path: kvPath(key), directory: DATA }).catch(() => undefined);
  },
};

async function listFiles(dir: string, directory: Directory = BULK): Promise<{ path: string; size: number }[]> {
  try {
    const { files } = await Filesystem.readdir({ path: dir, directory });
    const out: { path: string; size: number }[] = [];
    for (const file of files) {
      const path = `${dir}/${file.name}`;
      if (file.type === "directory") out.push(...(await listFiles(path, directory)));
      else out.push({ path, size: file.size });
    }
    return out;
  } catch {
    return [];
  }
}

const files: FileStore = {
  async write(path, bytes) {
    await Filesystem.writeFile({ path, directory: BULK, data: toBase64(bytes), recursive: true });
  },
  async url(path) {
    if (!(await exists(path, BULK))) return null;
    const { uri } = await Filesystem.getUri({ path, directory: BULK });
    return Capacitor.convertFileSrc(uri);
  },
  async remove(prefix) {
    const dir = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix.slice(0, prefix.lastIndexOf("/"));
    for (const file of await listFiles(dir)) {
      if (file.path.startsWith(prefix)) await Filesystem.deleteFile({ path: file.path, directory: BULK }).catch(() => undefined);
    }
  },
  async download(url, path) {
    await Filesystem.downloadFile({ url, path, directory: BULK, recursive: true });
    return (await Filesystem.stat({ path, directory: BULK })).size;
  },
  async size(prefix) {
    const dir = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix.slice(0, prefix.lastIndexOf("/"));
    return (await listFiles(dir)).filter((file) => file.path.startsWith(prefix)).reduce((total, file) => total + file.size, 0);
  },
};

async function connect(name: string): Promise<SQLiteDBConnection> {
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const known = (await sqlite.isConnection(name, false)).result;
  const db = consistent && known ? await sqlite.retrieveConnection(name, false) : await sqlite.createConnection(name, false, "no-encryption", 1, false);
  await db.open();
  return db;
}

class NativeDatabase implements DeviceDatabase {
  constructor(private readonly db: SQLiteDBConnection, private readonly scope: string) {}

  async all(sql: string, params: SqlValue[] = []): Promise<Row[]> {
    return ((await this.db.query(sql, params)).values ?? []) as Row[];
  }

  async run(sql: string, params: SqlValue[] = []): Promise<void> {
    await this.db.run(sql, params, false);
  }

  async transaction(statements: { sql: string; params?: SqlValue[] }[]): Promise<void> {
    if (!statements.length) return;
    await this.db.executeSet(
      statements.map((statement) => ({ statement: statement.sql, values: statement.params ?? [] })),
      true,
    );
  }

  private packPath(id: string) {
    return `packs/${this.scope}/${id}.db`;
  }

  async importPack(bytes: Uint8Array<ArrayBuffer>, id: string): Promise<Record<string, number>> {
    const { statements, counts } = await packStatements(bytes);
    await this.transaction(statements);
    // Kept so an app update that replaces the core can apply it again offline.
    await files.write(this.packPath(id), bytes);
    return counts;
  }

  async removePack(id: string, statements: { sql: string; params?: SqlValue[] }[]): Promise<void> {
    await this.transaction(statements);
    await Filesystem.deleteFile({ path: this.packPath(id), directory: BULK }).catch(() => undefined);
  }

  /** Apply every kept pack again (after the core was replaced). */
  async replayPacks(): Promise<void> {
    for (const file of await listFiles(`packs/${this.scope}`)) {
      const { data } = await Filesystem.readFile({ path: file.path, directory: BULK });
      const { statements } = await packStatements(fromBase64(typeof data === "string" ? data : await blobToBase64(data)));
      await this.transaction(statements);
    }
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return toBase64(new Uint8Array(await blob.arrayBuffer()));
}

async function bundledCoreVersion(): Promise<string> {
  try {
    const response = await fetch("/assets/databases/core.version");
    return response.ok ? (await response.text()).trim() : "";
  } catch {
    return "";
  }
}

export async function createCapacitorPlatform(): Promise<DevicePlatform> {
  return {
    name: Capacitor.getPlatform() === "ios" ? "ios" : "android",
    kv,
    files,
    async openQuran() {
      const bundled = await bundledCoreVersion();
      const installed = await kv.get(CORE_VERSION_KEY);
      const replaced = installed !== bundled;
      if (replaced) {
        if (await sqlite.isConnection("core", false).then((result) => result.result)) await sqlite.closeConnection("core", false);
        await sqlite.copyFromAssets(true);
      }
      const database = new NativeDatabase(await connect("core"), "quran");
      if (replaced) {
        if (installed !== null) await database.replayPacks();
        await kv.set(CORE_VERSION_KEY, bundled);
      }
      return database;
    },
    async openTranslations() {
      const database = new NativeDatabase(await connect("translations"), "translations");
      for (const sql of TRANSLATIONS_SCHEMA) await database.run(sql);
      return database;
    },
  };
}

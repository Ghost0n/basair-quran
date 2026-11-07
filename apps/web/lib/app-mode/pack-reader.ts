/**
 * Reading a downloaded pack database (a SQLite file) into the INSERT
 * statements that copy its data tables into the device database. sql.js
 * (WebAssembly) parses the file, so the same code serves Android and the
 * browser preview.
 */
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

import type { Row, SqlValue } from "@q-basair/offline-engine";

import { PACK_META_TABLES, insertStatements } from "./platform";

let sqlJs: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJs) {
    const wasm = new URL("sql.js/dist/sql-wasm.wasm", import.meta.url).href;
    sqlJs = initSqlJs({ locateFile: () => wasm });
  }
  return sqlJs;
}

export function sqlRows(db: Database, sql: string, params: SqlValue[] = []): Row[] {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const out: Row[] = [];
    while (statement.step()) out.push(statement.getAsObject() as Row);
    return out;
  } finally {
    statement.free();
  }
}

export async function packStatements(bytes: Uint8Array): Promise<{ statements: { sql: string; params: SqlValue[] }[]; counts: Record<string, number> }> {
  const SQL = await loadSqlJs();
  const pack = new SQL.Database(bytes);
  try {
    const counts: Record<string, number> = {};
    const statements: { sql: string; params: SqlValue[] }[] = [];
    for (const { name } of sqlRows(pack, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")) {
      const table = String(name);
      if (PACK_META_TABLES.has(table)) continue;
      const columns = sqlRows(pack, `PRAGMA table_info("${table}")`).map((column) => String(column.name));
      const data = (pack.exec(`SELECT ${columns.map((column) => `"${column}"`).join(", ")} FROM "${table}"`)[0]?.values ?? []) as SqlValue[][];
      counts[table] = data.length;
      statements.push(...insertStatements(table, columns, data));
    }
    return { statements, counts };
  } finally {
    pack.close();
  }
}

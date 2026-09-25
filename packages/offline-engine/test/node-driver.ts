import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import type { Row, SqlDriver, SqlValue } from "../src/db";

// Vite (vitest 2) does not know `node:sqlite` as a builtin yet; require it directly.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

/** node:sqlite behind the engine's driver interface (tests only). */
export function openNodeDriver(path: string): SqlDriver & { close(): void } {
  const db = new DatabaseSync(path, { readOnly: true });
  const statements = new Map<string, ReturnType<DatabaseSyncType["prepare"]>>();
  return {
    async all(sql: string, params: SqlValue[] = []): Promise<Row[]> {
      let statement = statements.get(sql);
      if (!statement) statements.set(sql, (statement = db.prepare(sql)));
      return statement.all(...params) as Row[];
    },
    close: () => db.close(),
  };
}

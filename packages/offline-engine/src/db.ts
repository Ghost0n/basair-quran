/**
 * The engine talks to SQLite through this one method, so the same code runs on
 * `node:sqlite` (tests), `@capacitor-community/sqlite` (Android) or anything
 * else that can run a parameterized SELECT and return rows as plain objects.
 */
export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type SqlValue = string | number | null;

export interface SqlDriver {
  all(sql: string, params?: SqlValue[]): Promise<Row[]>;
}

export async function one(db: SqlDriver, sql: string, params: SqlValue[] = []): Promise<Row | null> {
  const rows = await db.all(sql, params);
  return rows[0] ?? null;
}

export const placeholders = (values: unknown[]) => values.map(() => "?").join(",");

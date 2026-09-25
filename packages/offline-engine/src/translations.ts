/**
 * Translations of meanings, ported from src/app/services/translation_service.py.
 * On the phone every installed translation pack is merged into one local
 * database with the server's `translations` / `translation_ayahs` schema.
 */
import type { Row, SqlDriver } from "./db";
import { strip } from "./py";

export const MAX_AYAHS_PER_REQUEST = 400;
export const MAX_KEYS_PER_REQUEST = 3;
const REF = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/;

export class TranslationRequestError extends Error {}

export async function catalogue(db: SqlDriver | null): Promise<Row[]> {
  if (!db) return [];
  return db.all(
    "SELECT key, language, kind, name, translator, description, source, source_url, terms, version, direction, ayah_count FROM translations ORDER BY kind, language, source, name",
  );
}

export function parseRefs(raw: string): [number, number][] {
  const refs: [number, number][] = [];
  const seen = new Set<string>();
  for (let part of (raw || "").split(",")) {
    part = strip(part);
    if (!part) continue;
    const match = REF.exec(part);
    if (!match) throw new TranslationRequestError(`Invalid reference: ${Array.from(part).slice(0, 20).join("")}`);
    const surah = Number(match[1]);
    const start = Number(match[2]);
    const end = Number(match[3] ?? start);
    if (!(surah >= 1 && surah <= 114) || start < 1 || end < start || end > 286) {
      throw new TranslationRequestError(`Invalid reference: ${Array.from(part).slice(0, 20).join("")}`);
    }
    for (let ayah = start; ayah <= end; ayah += 1) {
      const key = `${surah}:${ayah}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push([surah, ayah]);
      }
      if (refs.length > MAX_AYAHS_PER_REQUEST) throw new TranslationRequestError(`At most ${MAX_AYAHS_PER_REQUEST} ayahs per request.`);
    }
  }
  return refs;
}

export async function ayahTexts(db: SqlDriver | null, rawKeys: string[], refs: [number, number][]) {
  const keys = [...new Set(rawKeys.filter(Boolean))].slice(0, MAX_KEYS_PER_REQUEST);
  if (!db || !keys.length || !refs.length) return { translations: [], ayahs: [] };
  const metaRows = await db.all(
    `SELECT key, language, kind, name, translator, source, source_url, direction FROM translations WHERE key IN (${keys.map(() => "?").join(", ")})`,
    keys,
  );
  const meta = new Map(metaRows.map((row) => [row.key as string, row]));
  const known = keys.filter((key) => meta.has(key));
  if (!known.length) return { translations: [], ayahs: [] };
  const texts = new Map<string, Map<string, Row>>();
  const surahs = [...new Set(refs.map(([surah]) => surah))].sort((a, b) => a - b);
  for (const surah of surahs) {
    const ayahs = refs.filter(([s]) => s === surah).map(([, ayah]) => ayah);
    const rows = await db.all(
      `SELECT key, surah, ayah, text, footnotes FROM translation_ayahs WHERE surah = ? AND ayah BETWEEN ? AND ? AND key IN (${known.map(() => "?").join(", ")})`,
      [surah, Math.min(...ayahs), Math.max(...ayahs), ...known],
    );
    const wanted = new Set(ayahs);
    for (const row of rows) {
      if (!wanted.has(row.ayah)) continue;
      const refKey = `${row.surah}:${row.ayah}`;
      if (!texts.has(refKey)) texts.set(refKey, new Map());
      texts.get(refKey)!.set(row.key, { key: row.key, text: row.text, footnotes: row.footnotes });
    }
  }
  return {
    translations: known.map((key) => meta.get(key)!),
    ayahs: refs.map(([surah, ayah]) => {
      const found = texts.get(`${surah}:${ayah}`);
      return { surah, ayah, texts: known.filter((key) => found?.has(key)).map((key) => found!.get(key)!) };
    }),
  };
}

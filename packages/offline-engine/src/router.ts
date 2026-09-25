/**
 * The on-device `/api/*`: the Quran routes of src/app/routes/{search,reader,
 * mushafs,translations}.py with the same query validation, the same handler
 * logic and the same response shaping. Anything else (accounts, research
 * agent, community, notebook sync) is not answered here: `handle` returns
 * null and the caller decides (network when online, an offline state if not).
 */
import type { SqlDriver } from "./db";
import { LocalStore, type StateStorage, handleLocal, isLocalRoute } from "./local-store";
import { MorphologyEngine } from "./morphology";
import { RECITERS } from "./models.generated";
import {
  buildExactQuerySimple,
  containsLatinText,
  normalizeQuerySearch,
  normalizeTextSearch,
  tokenizeExactQuery,
} from "./normalize";
import { len, split, strip } from "./py";
import { QuranEngine, type Suggestion } from "./quran";
import { shapeList, shapeModel } from "./shape";
import { TranslationRequestError, ayahTexts, catalogue, parseRefs } from "./translations";

export const MAX_QUERY_LENGTH = 120;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export type EngineRequest = { method?: string; url: string; body?: unknown };
export type EngineResponse = { status: number; body: unknown; headers?: Record<string, string> };

class HttpError extends Error {
  constructor(readonly status: number, readonly detail: unknown) {
    super(typeof detail === "string" ? detail : "validation error");
  }
}

type Issue = { type: string; loc: (string | number)[]; msg: string };

const INT = /^[+-]?\d+(?:_\d+)*(?:\.0*)?$/;
const TRUE = new Set(["1", "on", "t", "true", "y", "yes"]);
const FALSE = new Set(["0", "off", "f", "false", "n", "no"]);

/** FastAPI query-parameter validation (pydantic lax mode on strings). */
class Params {
  readonly issues: Issue[] = [];

  constructor(private readonly query: URLSearchParams, private readonly where: "query" | "body" = "query", private readonly body: Record<string, unknown> = {}) {}

  private raw(name: string): unknown {
    if (this.where === "body") return this.body[name];
    const values = this.query.getAll(name);
    return values.length ? values[values.length - 1] : undefined; // Starlette keeps the last one
  }

  private fail(name: string, type: string, msg: string): null {
    this.issues.push({ type, loc: [this.where, name], msg });
    return null;
  }

  int(name: string, options: { default?: number | null; ge?: number; le?: number } = {}): number | null {
    const raw = this.raw(name);
    if (raw === undefined || raw === null) {
      if ("default" in options) return options.default ?? null;
      return this.fail(name, "missing", "Field required");
    }
    let value: number;
    if (typeof raw === "number" && Number.isInteger(raw)) value = raw;
    else if (typeof raw === "string" && INT.test(raw)) value = Number(raw.replace(/_/g, "").replace(/\.0*$/, ""));
    else return this.fail(name, "int_parsing", "Input should be a valid integer, unable to parse string as an integer");
    if (options.ge !== undefined && value < options.ge) return this.fail(name, "greater_than_equal", `Input should be greater than or equal to ${options.ge}`);
    if (options.le !== undefined && value > options.le) return this.fail(name, "less_than_equal", `Input should be less than or equal to ${options.le}`);
    return value;
  }

  str(name: string, options: { default?: string | null; minLength?: number; maxLength?: number; pattern?: RegExp } = {}): string | null {
    const raw = this.raw(name);
    if (raw === undefined || raw === null) {
      if ("default" in options) return options.default ?? null;
      return this.fail(name, "missing", "Field required");
    }
    if (typeof raw !== "string") return this.fail(name, "string_type", "Input should be a valid string");
    const size = len(raw);
    if (options.minLength !== undefined && size < options.minLength) return this.fail(name, "string_too_short", `String should have at least ${options.minLength} characters`);
    if (options.maxLength !== undefined && size > options.maxLength) return this.fail(name, "string_too_long", `String should have at most ${options.maxLength} characters`);
    if (options.pattern && !options.pattern.test(raw)) return this.fail(name, "string_pattern_mismatch", `String should match pattern '${options.pattern.source}'`);
    return raw;
  }

  literal<T extends string>(name: string, values: readonly T[], fallback: T): T {
    const raw = this.raw(name);
    if (raw === undefined || raw === null) return fallback;
    if (!values.includes(raw as T)) {
      this.fail(name, "literal_error", `Input should be ${values.map((value) => `'${value}'`).join(" or ")}`);
      return fallback;
    }
    return raw as T;
  }

  bool(name: string, fallback: boolean): boolean {
    const raw = this.raw(name);
    if (raw === undefined || raw === null) return fallback;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number" && (raw === 0 || raw === 1)) return raw === 1;
    const text = String(raw).toLowerCase();
    if (TRUE.has(text)) return true;
    if (FALSE.has(text)) return false;
    this.fail(name, "bool_parsing", "Input should be a valid boolean, unable to interpret input");
    return fallback;
  }

  strList(name: string): string[] {
    const raw = this.raw(name);
    if (raw === undefined) {
      this.fail(name, "missing", "Field required");
      return [];
    }
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
      this.fail(name, "list_type", "Input should be a valid list of strings");
      return [];
    }
    return raw as string[];
  }

  check(): void {
    if (this.issues.length) throw new HttpError(422, this.issues);
  }
}

const RIWAYAH_BY_NAME: Record<string, string> = { "حفص": "hafs", "ورش": "warsh", "قالون": "qaloun", "شعبة": "shuba", "الدوري": "douri", "السوسي": "sousi" };

export type OfflineApiOptions = {
  /** The device's Quran database: core.db plus every installed narration pack. */
  quran: SqlDriver;
  /** Installed translation packs, merged (null when none is installed). */
  translations?: SqlDriver | null;
  /** Where the user's own data (notebook, themes, sessions, …) is kept; omit to leave those routes to the network. */
  userData?: StateStorage | null;
  clock?: () => number;
};

export class OfflineApi {
  readonly quran: QuranEngine;
  readonly morphology: MorphologyEngine;
  readonly store: LocalStore | null;
  private translations: SqlDriver | null;

  constructor(private readonly options: OfflineApiOptions) {
    this.quran = new QuranEngine(options.quran);
    this.morphology = new MorphologyEngine(options.quran);
    this.translations = options.translations ?? null;
    this.store = options.userData ? new LocalStore({ storage: options.userData, quran: this.quran, clock: options.clock }) : null;
  }

  /** After a pack is installed or removed. */
  reset(translations: SqlDriver | null = this.translations): void {
    this.quran.reset();
    this.translations = translations;
  }

  /** Answer one request, or null when the route is not available offline. */
  async handle(request: EngineRequest): Promise<EngineResponse | null> {
    const url = new URL(request.url, "http://offline.invalid");
    const method = (request.method ?? "GET").toUpperCase();
    const route = ROUTES[`${method} ${url.pathname.replace(/\/+$/, "")}`];
    if (!route) return this.store ? handleLocal(this.store, method, url.pathname, request.body) : null;
    try {
      return await route.call(this, url.searchParams, request.body);
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: { detail: error.detail } };
      throw error;
    }
  }

  /** Whether a path is answered on the device (the rest needs the network). */
  handles(method: string, path: string): boolean {
    const key = `${method.toUpperCase()} ${path.replace(/\/+$/, "")}`;
    return key in ROUTES || (this.store !== null && isLocalRoute(method.toUpperCase(), path));
  }

  // --- catalog ----------------------------------------------------------------

  async mushafs(): Promise<EngineResponse> {
    const rows = await this.options.quran.all("SELECT id, name, description FROM mushafs ORDER BY id");
    const items = rows.map((row) => ({ ...row, riwayah: RIWAYAH_BY_NAME[strip(row.name ?? "")] ?? "hafs" }));
    return ok(shapeList("MushafItem", items));
  }

  async surahs(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const mushaf = params.int("mushaf", { default: 1 });
    params.check();
    const rows = await this.options.quran.all(
      `SELECT s.id AS id, s.name_arabic AS name, s.name_english AS name_english, s.type AS type, COUNT(a.id) AS ayah_count
       FROM surahs s LEFT JOIN ayahs a ON a.surah_id = s.id AND a.mushaf_id = ?
       GROUP BY s.id, s.name_arabic, s.name_english, s.type
       ORDER BY s.id`,
      [mushaf],
    );
    return ok(shapeList("SurahListItem", rows));
  }

  async reciters(): Promise<EngineResponse> {
    return ok(shapeList("ReciterItem", RECITERS));
  }

  // --- search -----------------------------------------------------------------

  async suggest(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const q = params.str("q", { minLength: 1, maxLength: MAX_QUERY_LENGTH })!;
    const mushaf = params.int("mushaf", { default: 1 })!;
    const mode = params.literal("mode", ["root", "exact"] as const, "root");
    const withChakl = params.bool("with_chakl", false);
    params.check();
    const engine = this.quran;
    const qSimple = normalizeTextSearch(q);
    const latin = containsLatinText(q);
    const suggestions: Suggestion[] = [];
    if (latin && mode !== "exact") {
      suggestions.push(...(await engine.buildRootSuggestionsByLatin(q, mushaf, 5)));
      suggestions.push(...(await engine.buildWordSuggestionsByLatin(q, mushaf, 10, withChakl)));
    } else if (latin) {
      suggestions.push(...(await engine.buildWordSuggestionsByLatin(q, mushaf, 10, withChakl)));
    } else if (mode === "exact" && tokenizeExactQuery(q).length > 1) {
      suggestions.push(...(await engine.buildPhraseSuggestions(q, mushaf, 10, withChakl)));
    } else if (mode !== "exact") {
      suggestions.push(...(await engine.buildRootSuggestions(`${qSimple}%`, 5)));
      const roots = new Set(suggestions.filter((item) => item.type === "root").map((item) => item.text));
      for (const item of await engine.buildRootSuggestionsBySurfaceQuery(qSimple, mushaf, 5)) {
        if (roots.has(item.text)) continue;
        suggestions.push(item);
        roots.add(item.text);
      }
      suggestions.push(...(await engine.buildWordSuggestions(qSimple, mushaf, 10, withChakl)));
    } else {
      suggestions.push(...(await engine.buildWordSuggestions(qSimple, mushaf, 10, withChakl)));
    }
    return ok(shapeList("SuggestionItem", suggestions));
  }

  async suggestBatch(_query: URLSearchParams, body: unknown): Promise<EngineResponse> {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(422, [{ type: "model_attributes_type", loc: ["body"], msg: "Input should be a valid dictionary or object to extract fields from" }]);
    }
    const params = new Params(new URLSearchParams(), "body", body as Record<string, unknown>);
    const allQueries = params.strList("queries");
    const mushaf = params.int("mushaf", { default: 1 })!;
    const mode = params.literal("mode", ["root", "exact"] as const, "root");
    const withChakl = params.bool("with_chakl", false);
    params.check();
    const engine = this.quran;
    const combined = new Map<string, Suggestion>();
    const put = (key: string, item: Suggestion) => {
      if (!combined.has(key)) combined.set(key, item);
    };
    const queries = allQueries.slice(0, 5);
    if (queries.some((query) => len(query) > MAX_QUERY_LENGTH)) {
      throw new HttpError(422, `Suggestion queries must be at most ${MAX_QUERY_LENGTH} characters.`);
    }
    for (const query of queries) {
      const qSimple = normalizeTextSearch(query);
      const latin = containsLatinText(query);
      if (!qSimple) continue;
      if (latin && mode !== "exact") {
        for (const item of await engine.buildRootSuggestionsByLatin(query, mushaf, 2)) put(`root:${item.text}`, item);
        for (const item of await engine.buildWordSuggestionsByLatin(query, mushaf, 5, withChakl)) put(`word:${item.text}`, item);
        continue;
      }
      if (latin) {
        for (const item of await engine.buildWordSuggestionsByLatin(query, mushaf, 5, withChakl)) put(`word:${item.text}`, item);
        continue;
      }
      if (mode === "exact" && tokenizeExactQuery(query).length > 1) {
        for (const item of await engine.buildPhraseSuggestions(query, mushaf, 5, withChakl)) put(`phrase:${item.text}`, item);
        continue;
      }
      if (mode !== "exact") {
        for (const item of await engine.buildRootSuggestions(`${qSimple}%`, 2)) put(`root:${item.text}`, item);
        for (const item of await engine.buildRootSuggestionsBySurfaceQuery(qSimple, mushaf, 2)) put(`root:${item.text}`, item);
      }
      for (const item of await engine.buildWordSuggestions(qSimple, mushaf, 5, withChakl)) put(`word:${item.text}`, item);
    }
    return ok(shapeList("SuggestionItem", [...combined.values()]));
  }

  private searchParams(query: URLSearchParams) {
    const params = new Params(query);
    const q = params.str("q", { maxLength: MAX_QUERY_LENGTH })!;
    const mode = params.literal("mode", ["root", "exact"] as const, "root");
    const mushaf = params.int("mushaf", { default: 1 })!;
    return { params, q, mode, mushaf };
  }

  private static querySimple(q: string, mode: string): string {
    return mode === "exact" ? buildExactQuerySimple(q) : normalizeQuerySearch(q);
  }

  async search(query: URLSearchParams): Promise<EngineResponse> {
    const { params, q, mode, mushaf } = this.searchParams(query);
    params.check();
    const qSimple = OfflineApi.querySimple(q, mode);
    if (mode === "exact") {
      const [results, didYouMean] = await this.quran.buildLegacyExactResults(q, qSimple, mushaf);
      if (!results.length) return ok(shapeModel("LegacySearchResponse", { found: false, message: "No results found.", results: [], did_you_mean: didYouMean }, true));
      return ok(shapeModel("LegacySearchResponse", { found: true, results }, true));
    }
    const results = await this.quran.buildLegacyRootResults(qSimple, mushaf);
    if (!results.length) return ok(shapeModel("LegacySearchResponse", { found: false, message: "No results found.", results: [] }, true));
    return ok(shapeModel("LegacySearchResponse", { found: true, results }, true));
  }

  async searchV2(query: URLSearchParams): Promise<EngineResponse> {
    const { params, q, mode, mushaf } = this.searchParams(query);
    const pageSize = params.int("page_size", { default: DEFAULT_PAGE_SIZE, ge: 1, le: MAX_PAGE_SIZE })!;
    params.check();
    const qSimple = OfflineApi.querySimple(q, mode);
    const [results, didYouMean] = await this.quran.buildPaginatedSearchResults(q, qSimple, mode, mushaf, pageSize);
    if (!results.length) {
      return ok(shapeModel("PaginatedSearchResponse", { found: false, message: "No results found.", page_size: pageSize, results: [], did_you_mean: didYouMean }, true));
    }
    return ok(shapeModel("PaginatedSearchResponse", { found: true, page_size: pageSize, results }, true));
  }

  async searchResultPage(query: URLSearchParams): Promise<EngineResponse> {
    const { params, q, mode, mushaf } = this.searchParams(query);
    const resultKey = params.str("result_key", { minLength: 1 })!;
    const page = params.int("page", { default: 1, ge: 1 })!;
    const pageSize = params.int("page_size", { default: DEFAULT_PAGE_SIZE, ge: 1, le: MAX_PAGE_SIZE })!;
    params.check();
    const qSimple = OfflineApi.querySimple(q, mode);
    const result = await this.quran.buildSingleResultPage(q, qSimple, mode, mushaf, resultKey, page, pageSize);
    if (result === null) throw new HttpError(404, "Result page not found.");
    return ok(shapeModel("SearchResultPageResponse", { found: true, result }, true));
  }

  async rootDistribution(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const root = params.str("root", { maxLength: MAX_QUERY_LENGTH })!;
    const mushaf = params.int("mushaf", { default: 1 })!;
    params.check();
    return ok(shapeModel("RootDistributionResponse", await this.quran.buildRootDistribution(root, mushaf), true));
  }

  // --- reader -----------------------------------------------------------------

  async ayahReader(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const mushaf = params.int("mushaf", { default: 1 })!;
    const ayahId = params.int("ayah_id", { ge: 1 })!;
    const before = params.int("before", { default: 7, ge: 0, le: 50 })!;
    const after = params.int("after", { default: 7, ge: 0, le: 50 })!;
    params.check();
    return ok(shapeModel("AyahReaderResponse", await this.quran.buildAyahReaderPayload(mushaf, ayahId, before, after), true));
  }

  async ayahReaderMore(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const mushaf = params.int("mushaf", { default: 1 })!;
    const surahId = params.int("surah_id", { ge: 1 })!;
    const anchor = params.int("anchor_ayah", { ge: 1 })!;
    const direction = params.str("direction", { pattern: /^(before|after)$/ })!;
    const count = params.int("count", { default: 10, ge: 1, le: 50 })!;
    params.check();
    return ok(shapeModel("AyahReaderMoreResponse", await this.quran.buildAyahReaderMorePayload(mushaf, surahId, anchor, direction, count), true));
  }

  async quranPage(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const mushaf = params.int("mushaf", { default: 1 })!;
    const page = params.int("page", { default: null, ge: 1 });
    const ayahId = params.int("ayah_id", { default: null, ge: 1 });
    const selected = params.int("selected_ayah_id", { default: null, ge: 1 });
    const surah = params.int("surah", { default: null, ge: 1, le: 114 });
    const ayah = params.int("ayah", { default: null, ge: 1 });
    const juz = params.int("juz", { default: null, ge: 1, le: 30 });
    params.check();
    return ok(shapeModel("QuranPageResponse", await this.quran.buildQuranPagePayload(mushaf, page, ayahId, selected, surah, ayah, juz), true));
  }

  async mushafPageLayout(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const mushaf = params.int("mushaf", { default: 2 })!;
    const page = params.int("page", { default: null, ge: 1, le: 604 });
    const selected = params.int("selected_ayah_id", { default: null, ge: 1 });
    params.check();
    return ok(shapeModel("MushafPageLayoutResponse", await this.quran.buildMushafPageLayout(mushaf, page, selected), true));
  }

  async textCount(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const text = params.str("text", { minLength: 1, maxLength: 300 })!;
    const mushaf = params.int("mushaf", { default: 2, ge: 1 })!;
    const surah = params.int("surah", { default: null, ge: 1, le: 114 });
    const page = params.int("page", { default: null, ge: 1, le: 700 });
    params.check();
    if (split(text).length > 12) throw new HttpError(422, "Select at most 12 words to count.");
    const result = await this.quran.countText(mushaf, text, surah, page);
    if (!result.text) throw new HttpError(422, "The selection has no Arabic letters to count.");
    return ok(shapeModel("TextCountResponse", result));
  }

  async morphologyRoute(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const surah = params.int("surah", { ge: 1, le: 114 })!;
    const ayah = params.int("ayah", { ge: 1 })!;
    const mushaf = params.int("mushaf", { default: null, ge: 1 });
    let text = params.str("text", { default: null });
    params.check();
    if (text === null && mushaf !== null) text = await this.quran.getAyahText(mushaf, surah, ayah);
    return ok(shapeModel("MorphologyResponse", await this.morphology.getAyahMorphology(surah, ayah, text), true));
  }

  // --- translations -------------------------------------------------------------

  async translationList(): Promise<EngineResponse> {
    return { ...ok(shapeList("TranslationInfo", await catalogue(this.translations))), headers: { "Cache-Control": "public, max-age=300" } };
  }

  async translationAyahs(query: URLSearchParams): Promise<EngineResponse> {
    const params = new Params(query);
    const keys = params.str("keys", { maxLength: 260 })!;
    const refs = params.str("refs", { maxLength: 2000 })!;
    params.check();
    let parsed: [number, number][];
    try {
      parsed = parseRefs(refs);
    } catch (error) {
      if (error instanceof TranslationRequestError) throw new HttpError(422, error.message);
      throw error;
    }
    const payload = await ayahTexts(this.translations, keys.split(","), parsed);
    return { ...ok(shapeModel("TranslationAyahsResponse", payload, true)), headers: { "Cache-Control": "public, max-age=3600" } };
  }
}

function ok(body: unknown): EngineResponse {
  return { status: 200, body };
}

type Handler = (this: OfflineApi, query: URLSearchParams, body: unknown) => Promise<EngineResponse>;

const ROUTES: Record<string, Handler> = {
  "GET /api/mushafs": OfflineApi.prototype.mushafs,
  "GET /api/surahs": OfflineApi.prototype.surahs,
  "GET /api/reciters": OfflineApi.prototype.reciters,
  "GET /api/suggest": OfflineApi.prototype.suggest,
  "POST /api/suggest-batch": OfflineApi.prototype.suggestBatch,
  "GET /api/search": OfflineApi.prototype.search,
  "GET /api/search-v2": OfflineApi.prototype.searchV2,
  "GET /api/search-result-page": OfflineApi.prototype.searchResultPage,
  "GET /api/root-distribution": OfflineApi.prototype.rootDistribution,
  "GET /api/ayah-reader": OfflineApi.prototype.ayahReader,
  "GET /api/ayah-reader-more": OfflineApi.prototype.ayahReaderMore,
  "GET /api/quran-page": OfflineApi.prototype.quranPage,
  "GET /api/mushaf-page-layout": OfflineApi.prototype.mushafPageLayout,
  "GET /api/text-count": OfflineApi.prototype.textCount,
  "GET /api/morphology": OfflineApi.prototype.morphologyRoute,
  "GET /api/translations": OfflineApi.prototype.translationList,
  "GET /api/translations/ayahs": OfflineApi.prototype.translationAyahs,
};

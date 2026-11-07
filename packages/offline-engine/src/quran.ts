/**
 * The Quran search and reader engine, ported from
 * src/app/services/quran_service.py so the phone answers exactly like the
 * server. Functions keep their Python names (camelCased) and their order of
 * operations; the parity suite (test/parity.test.ts) compares both on the same
 * database.
 *
 * One deliberate difference: per-token morphology lookups, which the server
 * runs as thousands of small indexed queries, read an in-memory copy of
 * `morphology_search_variants` sorted with the same ORDER BY. Queries that run
 * once per request stay SQL, unchanged.
 */
import { type Row, type SqlDriver, one, placeholders } from "./db";
import {
  ARTICLE_LEMMA,
  type LatinVariants,
  type QueryToken,
  type VariantRecord,
  buildCandidateSurfaceText,
  buildExactQueryLabel,
  buildLatinKeyVariants,
  buildLatinSkeleton,
  formatSuggestionText,
  hasQueryDiacritics,
  normalizeCountText,
  normalizeLatinLookup,
  normalizeQuerySearch,
  normalizeTextSearch,
  plainArabicDisplayText,
  rankLatinVariantMatch,
  standardizeUthmani,
  stripLeadingBaseLetters,
  tokenizeExactQuery,
  uthmaniMatchesQuery,
} from "./normalize";
import { LruCache, chars, cmpKey, cmpStr, pyRound3, sequenceRatio, sortBy, split, strip, sum } from "./py";

export const PHRASE_SUGGESTION_MIN_CONFIDENCE = 0.88;
export const PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE = 0.72;
export const PHRASE_SUGGESTION_MIN_LEAD = 0.05;
export const WORD_SUGGESTION_MIN_CONFIDENCE = 0.86;
export const WORD_SUGGESTION_MIN_LEAD = 0.04;
export const HAFS_MUSHAF_ID = 2;
const MUSHAF_FONT_BASE_PATH = "/fonts/qpc-hafs-v1";
void ARTICLE_LEMMA;

type Scope = "word" | "phrase";
type Record_ = VariantRecord & { scope?: Scope };
type Token = { word_position: number; word_text: string; word_simple: string; phrase_records: Record_[] };
type TokenAyah = {
  ayah_id: number;
  mushaf_id: number;
  surah_id: number;
  surah_name: string;
  number_in_surah: number;
  text_uthmani: string;
  global_index: number;
  tokens: Token[];
};
export type Suggestion = { type: "word" | "root" | "phrase"; text: string; label: string };
export type DidYouMean = { text: string; confidence: number } | null;
type PhraseMetadata = { ayahs: TokenAyah[]; phrase_forms: Set<string>; positions_by_form: Map<string, [number, number][]> };
type PageIndex = {
  min_page: number | null;
  max_page: number | null;
  page_count: number;
  page_to_ayahs: Map<number, Row[]>;
  ayah_to_primary_page: Map<number, number>;
};

const recordOrder = (record: Record_) => [-record.stripped_prefix_count, record.stripped_article_count, chars(record.search_simple).length, record.search_text];
const sep = "\u0000";

export type EngineOptions = { mushafCacheLimit?: number; queryCacheLimit?: number };

export class QuranEngine {
  private variantsBySurface: Map<string, { word: Record_[]; phrase: Record_[] }> | null = null;
  private variantsLoading: Promise<void> | null = null;
  private readonly pageIndexCache: LruCache<number, PageIndex>;
  private readonly latinWordIndexCache: LruCache<number, { plain_text: string; vocalized_text: string; variants: LatinVariants }[]>;
  private readonly latinRootIndexCache: LruCache<number, { text: string; variants: LatinVariants }[]>;
  private readonly wordCandidatesCache: LruCache<number, { search_simple: string; text: string; penalty: number }[]>;
  private readonly phraseMetadataCache: LruCache<number, PhraseMetadata>;
  private readonly phraseDidYouMeanCache: LruCache<string, DidYouMean>;
  private readonly wordDidYouMeanCache: LruCache<string, DidYouMean>;
  private layoutIndex: Row | null = null;
  private readonly countCorpusCache = new Map<number, [number, number, string[], string][]>();

  constructor(private readonly db: SqlDriver, options: EngineOptions = {}) {
    const mushafLimit = options.mushafCacheLimit ?? 4;
    const queryLimit = options.queryCacheLimit ?? 256;
    this.pageIndexCache = new LruCache(mushafLimit);
    this.latinWordIndexCache = new LruCache(mushafLimit);
    this.latinRootIndexCache = new LruCache(mushafLimit);
    this.wordCandidatesCache = new LruCache(mushafLimit);
    this.phraseMetadataCache = new LruCache(mushafLimit);
    this.phraseDidYouMeanCache = new LruCache(queryLimit);
    this.wordDidYouMeanCache = new LruCache(queryLimit);
  }

  /** Forget everything derived from the database (after installing or removing a pack). */
  reset(): void {
    this.pageIndexCache.clear();
    this.latinWordIndexCache.clear();
    this.latinRootIndexCache.clear();
    this.wordCandidatesCache.clear();
    this.phraseMetadataCache.clear();
    this.phraseDidYouMeanCache.clear();
    this.wordDidYouMeanCache.clear();
    this.layoutIndex = null;
    this.countCorpusCache.clear();
  }

  // --- morphology variants (in memory) ------------------------------------

  private async variants(): Promise<Map<string, { word: Record_[]; phrase: Record_[] }>> {
    if (this.variantsBySurface) return this.variantsBySurface;
    if (!this.variantsLoading) {
      this.variantsLoading = (async () => {
        const rows = await this.db.all(
          "SELECT surface_simple, search_simple, search_text, stripped_prefix_count, stripped_article_count, scope FROM morphology_search_variants",
        );
        const index = new Map<string, { word: Record_[]; phrase: Record_[] }>();
        for (const row of rows) {
          if (row.scope !== "word" && row.scope !== "phrase") continue;
          let entry = index.get(row.surface_simple);
          if (!entry) index.set(row.surface_simple, (entry = { word: [], phrase: [] }));
          entry[row.scope as Scope].push({
            search_simple: row.search_simple,
            search_text: row.search_text,
            stripped_prefix_count: Number(row.stripped_prefix_count),
            stripped_article_count: Number(row.stripped_article_count),
            scope: row.scope,
          });
        }
        for (const entry of index.values()) {
          entry.word = sortBy(entry.word, recordOrder);
          entry.phrase = sortBy(entry.phrase, recordOrder);
        }
        this.variantsBySurface = index;
      })();
    }
    await this.variantsLoading;
    return this.variantsBySurface!;
  }

  /** fetch_morphology_variant_records */
  private async variantRecords(surfaceSimple: string, scope: Scope): Promise<Record_[]> {
    const entry = (await this.variants()).get(surfaceSimple);
    return entry ? entry[scope].map(({ scope: _scope, ...record }) => record) : [];
  }

  /** fetch_morphology_variant_records_any_scope(…, ("word", "phrase")) */
  private async variantRecordsAnyScope(surfaceSimple: string): Promise<Record_[]> {
    if (!surfaceSimple) return [];
    const entry = (await this.variants()).get(surfaceSimple);
    return entry ? [...entry.word, ...entry.phrase] : [];
  }

  // --- counting -------------------------------------------------------------

  private async countCorpus(mushafId: number) {
    const cached = this.countCorpusCache.get(mushafId);
    if (cached) return cached;
    const rows = await this.db.all("SELECT surah_id, page, text_simple FROM ayahs WHERE mushaf_id = ? ORDER BY global_index", [mushafId]);
    const corpus = rows.map((row) => {
      const simple = normalizeCountText(row.text_simple || "");
      const span = parsePageSpan(row.page);
      return [Number(row.surah_id), span ? span[0] : 0, split(simple), simple.replaceAll(" ", "")] as [number, number, string[], string];
    });
    this.countCorpusCache.set(mushafId, corpus);
    return corpus;
  }

  async countText(mushafId: number, text: string, surah: number | null = null, page: number | null = null) {
    const normalized = normalizeCountText(text);
    const phrase = split(normalized);
    const letters = [...new Set(chars(normalized).filter((char) => char !== " "))].sort(cmpStr);
    type Scopes = { quran: number; surah: number | null; page: number | null };
    const blank = (): Scopes => ({ quran: 0, surah: surah ? 0 : null, page: page ? 0 : null });
    const phraseCounts = blank();
    const letterCounts = new Map(letters.map((letter) => [letter, blank()]));
    const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;
    for (const [ayahSurah, ayahPage, tokens, lettersText] of await this.countCorpus(mushafId)) {
      const inScope: [keyof Scopes, boolean][] = [
        ["quran", true],
        ["surah", surah !== null && ayahSurah === surah],
        ["page", page !== null && ayahPage === page],
      ];
      const occurrences = phraseOccurrences(tokens, phrase);
      for (const [scope, inside] of inScope) {
        if (!inside) continue;
        (phraseCounts[scope] as number) += occurrences;
        for (const letter of letters) (letterCounts.get(letter)![scope] as number) += countOf(lettersText, letter);
      }
    }
    return {
      text: normalized,
      word_count: phrase.length,
      phrase: phraseCounts,
      letters: letters.map((letter) => ({ letter, in_selection: countOf(normalized, letter), ...letterCounts.get(letter)! })),
    };
  }

  async getAyahText(mushafId: number, surah: number, ayah: number): Promise<string | null> {
    const row = await one(this.db, "SELECT text_uthmani FROM ayahs WHERE mushaf_id = ? AND surah_id = ? AND number_in_surah = ?", [mushafId, surah, ayah]);
    return row ? row.text_uthmani : null;
  }

  /** get_ayah_verse: one ayah as a search-verse record (no highlights), or null. */
  async getAyahVerse(mushafId: number, surah: number, ayah: number): Promise<Row | null> {
    const row = await one(
      this.db,
      `SELECT a.id AS ayah_id, a.mushaf_id, s.name_arabic AS surah_name, a.surah_id, a.number_in_surah, a.text_uthmani, a.global_index
       FROM ayahs a JOIN surahs s ON s.id = a.surah_id
       WHERE a.mushaf_id = ? AND a.surah_id = ? AND a.number_in_surah = ?`,
      [mushafId, surah, ayah],
    );
    if (row === null) return null;
    return {
      ayah_id: row.ayah_id,
      mushaf_id: row.mushaf_id,
      surah: row.surah_name,
      surah_id: row.surah_id,
      ayah: row.number_in_surah,
      text: row.text_uthmani,
      global_index: row.global_index,
      highlights: [],
    };
  }

  // --- surfaces ---------------------------------------------------------------

  async resolveExactWordSurfaces(qSimple: string): Promise<string[]> {
    if (!qSimple) return [];
    const rows = await this.db.all(
      `SELECT surface_simple, scope FROM morphology_search_variants
       WHERE scope IN ('word', 'phrase') AND search_simple = ? AND stripped_article_count = 0
       ORDER BY CASE scope WHEN 'word' THEN 0 ELSE 1 END, surface_simple`,
      [qSimple],
    );
    const ordered = [qSimple];
    const seen = new Set([qSimple]);
    for (const row of rows) {
      if (seen.has(row.surface_simple)) continue;
      ordered.push(row.surface_simple);
      seen.add(row.surface_simple);
    }
    return ordered;
  }

  async resolvePrefixWordSurfaces(qSimple: string, limit: number): Promise<string[]> {
    if (!qSimple || limit <= 0) return [];
    const rows = await this.db.all(
      `SELECT surface_simple, scope FROM morphology_search_variants
       WHERE scope IN ('word', 'phrase') AND search_simple LIKE ? AND stripped_article_count = 0
       ORDER BY CASE scope WHEN 'word' THEN 0 ELSE 1 END, search_simple, surface_simple
       LIMIT ?`,
      [`${qSimple}%`, limit],
    );
    const surfaces: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.surface_simple)) continue;
      surfaces.push(row.surface_simple);
      seen.add(row.surface_simple);
    }
    return surfaces;
  }

  private async phraseSurfaceRecords(surfaceSimple: string, surfaceText: string): Promise<Record_[]> {
    const records = await this.variantRecords(surfaceSimple, "phrase");
    if (records.length) return records;
    return [{ search_simple: surfaceSimple, search_text: surfaceText, stripped_prefix_count: 0, stripped_article_count: 0 }];
  }

  private async candidatePhraseRecords(token: Token | Row): Promise<Record_[]> {
    const cached = token.phrase_records as Record_[] | undefined;
    if (cached && cached.length) return cached;
    return this.phraseSurfaceRecords(token.word_simple, token.word_text);
  }

  // --- phrase matching --------------------------------------------------------

  private async phraseSimilarityScoreMaps(queryTokens: QueryToken[], phraseForms: Set<string>): Promise<Map<string, number>[] | null> {
    const scoreMaps: Map<string, number>[] = [];
    for (const queryToken of queryTokens) {
      let bestScore = 0.0;
      const scoreMap = new Map<string, number>();
      const querySimple = queryToken.simple;
      const queryLength = chars(querySimple).length;
      const first = chars(querySimple)[0];
      const candidates: string[] = [];
      for (const form of phraseForms) {
        if (!form || !querySimple) continue;
        const formLength = chars(form).length;
        if (chars(form)[0] === first && Math.min(formLength, queryLength) / Math.max(formLength, queryLength) >= 0.55) candidates.push(form);
      }
      if (!candidates.length) return null;
      for (const form of candidates) {
        const score = sequenceRatio(queryToken.simple, form);
        if (score > bestScore) bestScore = score;
        if (score >= PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE) scoreMap.set(form, score);
      }
      if (bestScore < PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE) return null;
      scoreMaps.push(scoreMap);
    }
    return scoreMaps;
  }

  private async selectBestPhraseCandidateRecord(queryToken: QueryToken, candidate: Token, scoreMap: Map<string, number> | null): Promise<[Record_ | null, number]> {
    let bestRecord: Record_ | null = null;
    let bestScore = -1.0;
    let bestDiacriticMatch = -1;
    let bestPenalty = Infinity;
    for (const record of await this.candidatePhraseRecords(candidate)) {
      if (scoreMap !== null && !scoreMap.has(record.search_simple)) continue;
      const similarity = scoreMap !== null ? scoreMap.get(record.search_simple)! : sequenceRatio(queryToken.simple, record.search_simple);
      let diacriticMatch = 0;
      if (queryToken.has_diacritics) diacriticMatch = uthmaniMatchesQuery(queryToken.standardized, record.search_text) ? 1 : 0;
      const penalty = record.stripped_prefix_count + record.stripped_article_count;
      if (
        similarity > bestScore ||
        (similarity === bestScore && (diacriticMatch > bestDiacriticMatch || (diacriticMatch === bestDiacriticMatch && penalty < bestPenalty)))
      ) {
        bestRecord = record;
        bestScore = similarity;
        bestDiacriticMatch = diacriticMatch;
        bestPenalty = penalty;
      }
    }
    return [bestRecord, Math.max(bestScore, 0.0)];
  }

  private async phraseQueryTokenMatchesCandidate(queryToken: QueryToken, candidate: Token): Promise<boolean> {
    const records = await this.candidatePhraseRecords(candidate);
    if (queryToken.has_diacritics) {
      if (candidate.word_simple === queryToken.simple && uthmaniMatchesQuery(queryToken.standardized, candidate.word_text)) return true;
      return records.some(
        (record) =>
          record.search_simple === queryToken.simple &&
          uthmaniMatchesQuery(queryToken.standardized, buildCandidateSurfaceText(candidate.word_text, record)),
      );
    }
    return records.some((record) => record.search_simple === queryToken.simple);
  }

  // --- suggestions ------------------------------------------------------------

  private async preferredSuggestionText(surfaceSimple: string, qSimple: string, withChakl: boolean, surfaceText: string | null): Promise<string | null> {
    const records = (await this.variantRecordsAnyScope(surfaceSimple)).filter(
      (record) => record.search_simple.startsWith(qSimple) && record.stripped_article_count === 0,
    );
    if (!records.length) return null;
    const [best] = sortBy(records, (record) => [
      hasQueryDiacritics(record.search_text) === withChakl ? 0 : 1,
      -record.stripped_prefix_count,
      chars(record.search_simple).length,
      record.search_text,
    ]);
    const source = surfaceText !== null ? buildCandidateSurfaceText(surfaceText, best) : best.search_text;
    return formatSuggestionText(source, withChakl);
  }

  private async wordSuggestionsBySurfaceSimples(surfaceSimples: string[], qSimple: string, mushaf: number, limit: number, withChakl: boolean): Promise<Suggestion[]> {
    if (!surfaceSimples.length || limit <= 0) return [];
    let rows = await this.db.all(
      `SELECT DISTINCT aw.word_text, aw.word_simple FROM ayah_words aw
       WHERE aw.word_simple IN (${placeholders(surfaceSimples)}) AND aw.mushaf_id = ?
       LIMIT ?`,
      [...surfaceSimples, mushaf, limit],
    );
    // Like the server's dict comprehension, a repeated surface keeps its last index.
    const rank = new Map<string, number>();
    surfaceSimples.forEach((surface, index) => rank.set(surface, index));
    rows = sortBy(rows, (row) => [rank.get(row.word_simple) ?? rank.size, row.word_text]);
    const suggestions: Suggestion[] = [];
    for (const row of rows) {
      let displayText = (await this.preferredSuggestionText(row.word_simple, qSimple, withChakl, row.word_text)) || formatSuggestionText(row.word_text, withChakl);
      let displaySimple = normalizeTextSearch(displayText);
      if (!(await this.exactCandidateMatchesQuery(row, displayText, displaySimple))) {
        displayText = formatSuggestionText(row.word_text, withChakl);
        displaySimple = row.word_simple;
      }
      if (!(await this.exactCandidateMatchesQuery(row, displayText, displaySimple))) continue;
      suggestions.push({ type: "word", text: displayText, label: displayText });
    }
    return suggestions;
  }

  async buildRootSuggestions(likeQ: string, limit: number): Promise<Suggestion[]> {
    const rows = await this.db.all("SELECT root_text FROM roots WHERE root_simple LIKE ? LIMIT ?", [likeQ, limit]);
    return rows.map((row) => ({ type: "root", text: row.root_text, label: `جذر ${row.root_text}` }));
  }

  async buildRootSuggestionsBySurfaceQuery(qSimple: string, mushaf: number, limit: number): Promise<Suggestion[]> {
    if (!qSimple || limit <= 0) return [];
    const surfaces = await this.resolveExactWordSurfaces(qSimple);
    if (!surfaces.length) return [];
    const rows = await this.db.all(
      `SELECT DISTINCT r.root_text, r.root_simple FROM roots r
       JOIN word_occurrences wo ON wo.root_id = r.id
       JOIN ayahs a ON a.id = wo.ayah_id
       WHERE wo.word_simple IN (${placeholders(surfaces)}) AND a.mushaf_id = ?
       ORDER BY LENGTH(r.root_simple), r.root_text
       LIMIT ?`,
      [...surfaces, mushaf, limit],
    );
    return rows.map((row) => ({ type: "root", text: row.root_text, label: `جذر ${row.root_text}` }));
  }

  private async latinRootIndex(mushaf: number) {
    const cached = this.latinRootIndexCache.get(mushaf);
    if (cached) return cached;
    const rows = await this.db.all(
      `SELECT DISTINCT r.root_text FROM roots r
       JOIN word_occurrences wo ON wo.root_id = r.id
       JOIN ayahs a ON a.id = wo.ayah_id
       WHERE a.mushaf_id = ?
       ORDER BY r.root_text`,
      [mushaf],
    );
    const items: { text: string; variants: LatinVariants }[] = [];
    for (const row of rows) {
      const variants = buildLatinKeyVariants(row.root_text);
      if (!variants.full.length) continue;
      items.push({ text: row.root_text, variants });
    }
    return this.latinRootIndexCache.set(mushaf, items);
  }

  async buildRootSuggestionsByLatin(query: string, mushaf: number, limit: number): Promise<Suggestion[]> {
    const queryFull = normalizeLatinLookup(query);
    const querySkeleton = buildLatinSkeleton(query);
    if (!queryFull || limit <= 0) return [];
    const ranked: [[number, number], string][] = [];
    for (const item of await this.latinRootIndex(mushaf)) {
      const rank = rankLatinVariantMatch(queryFull, querySkeleton, item.variants);
      if (rank !== null) ranked.push([rank, item.text]);
    }
    return sortBy(ranked, ([rank, text]) => [rank, text])
      .slice(0, limit)
      .map(([, text]) => ({ type: "root", text, label: `جذر ${text}` }));
  }

  private async latinWordIndex(mushaf: number) {
    const cached = this.latinWordIndexCache.get(mushaf);
    if (cached) return cached;
    const rows = await this.db.all("SELECT DISTINCT word_text, word_simple FROM ayah_words WHERE mushaf_id = ? ORDER BY word_simple, word_text", [mushaf]);
    const indexed = new Map<string, { plain_text: string; vocalized_text: string; full: Set<string>; skeleton: Set<string> }>();
    const recordCache = new Map<string, Record_[]>();
    for (const row of rows) {
      if (!recordCache.has(row.word_simple)) recordCache.set(row.word_simple, await this.variantRecords(row.word_simple, "word"));
      const surfaces = new Map<string, [string, string]>();
      const add = (text: string) => {
        const pair: [string, string] = [formatSuggestionText(text, false), formatSuggestionText(text, true)];
        surfaces.set(pair.join(sep), pair);
      };
      add(row.word_text);
      for (const record of recordCache.get(row.word_simple)!) add(buildCandidateSurfaceText(row.word_text, record));
      // The server iterates a set here, so which vocalized form wins a shared
      // plain form is arbitrary there; this keeps the first one, deterministically.
      for (const [plainText, vocalizedText] of surfaces.values()) {
        if (!plainText) continue;
        const variants = buildLatinKeyVariants(plainText);
        if (!variants.full.length) continue;
        let item = indexed.get(plainText);
        if (!item) indexed.set(plainText, (item = { plain_text: plainText, vocalized_text: vocalizedText, full: new Set(), skeleton: new Set() }));
        variants.full.forEach((key) => item!.full.add(key));
        variants.skeleton.forEach((key) => item!.skeleton.add(key));
      }
    }
    const items = [...indexed.values()].map((item) => ({
      plain_text: item.plain_text,
      vocalized_text: item.vocalized_text,
      variants: { full: [...item.full].sort(cmpStr), skeleton: [...item.skeleton].sort(cmpStr) },
    }));
    return this.latinWordIndexCache.set(mushaf, items);
  }

  async buildWordSuggestionsByLatin(query: string, mushaf: number, limit: number, withChakl = false): Promise<Suggestion[]> {
    const queryFull = normalizeLatinLookup(query);
    const querySkeleton = buildLatinSkeleton(query);
    if (!queryFull || limit <= 0) return [];
    const ranked: [[number, number], { plain_text: string; vocalized_text: string }][] = [];
    for (const item of await this.latinWordIndex(mushaf)) {
      const rank = rankLatinVariantMatch(queryFull, querySkeleton, item.variants);
      if (rank !== null) ranked.push([rank, item]);
    }
    return sortBy(ranked, ([rank, item]) => [rank, item.plain_text])
      .slice(0, limit)
      .map(([, item]) => {
        const text = withChakl ? item.vocalized_text : item.plain_text;
        return { type: "word", text, label: text };
      });
  }

  async buildWordSuggestions(qSimple: string, mushaf: number, limit: number, withChakl = false): Promise<Suggestion[]> {
    if (!qSimple || limit <= 0) return [];
    const rows = await this.db.all("SELECT DISTINCT word_text, word_simple FROM ayah_words WHERE word_simple LIKE ? AND mushaf_id = ? LIMIT ?", [
      `${qSimple}%`,
      mushaf,
      limit,
    ]);
    const suggestions: Suggestion[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const displayText = (await this.preferredSuggestionText(row.word_simple, qSimple, withChakl, row.word_text)) || formatSuggestionText(row.word_text, withChakl);
      if (seen.has(displayText)) continue;
      suggestions.push({ type: "word", text: displayText, label: displayText });
      seen.add(displayText);
    }
    const remaining = limit - suggestions.length;
    if (remaining <= 0) return suggestions;
    const smartSurfaces = (await this.resolvePrefixWordSurfaces(qSimple, limit * 5)).filter((surface) => !surface.startsWith(qSimple));
    for (const item of await this.wordSuggestionsBySurfaceSimples(smartSurfaces, qSimple, mushaf, remaining, withChakl)) {
      if (seen.has(item.text)) continue;
      suggestions.push(item);
      seen.add(item.text);
      if (suggestions.length >= limit) break;
    }
    return suggestions;
  }

  private async selectPhraseSuggestionRecord(queryToken: QueryToken, candidate: Token, allowPrefix: boolean): Promise<Record_ | null> {
    if (!queryToken.simple) return null;
    const matching: Record_[] = [];
    for (const record of await this.candidatePhraseRecords(candidate)) {
      let matched: boolean;
      if (allowPrefix) matched = record.search_simple.startsWith(queryToken.simple);
      else if (queryToken.has_diacritics)
        matched = record.search_simple === queryToken.simple && uthmaniMatchesQuery(queryToken.standardized, buildCandidateSurfaceText(candidate.word_text, record));
      else matched = record.search_simple === queryToken.simple;
      if (matched) matching.push(record);
    }
    if (!matching.length) return null;
    return sortBy(matching, recordOrder)[0];
  }

  async buildPhraseSuggestions(q: string, mushaf: number, limit: number, withChakl = false): Promise<Suggestion[]> {
    const queryTokens = tokenizeExactQuery(q);
    const count = queryTokens.length;
    if (count < 2 || limit <= 0) return [];
    const metadata = await this.phraseMetadata(mushaf);
    const suggestions: Suggestion[] = [];
    const seen = new Set<string>();
    for (const [ayahIndex, tokenIndex] of metadata.positions_by_form.get(queryTokens[0].simple) ?? []) {
      const tokens = metadata.ayahs[ayahIndex].tokens;
      if (tokenIndex + count > tokens.length) continue;
      const window = tokens.slice(tokenIndex, tokenIndex + count);
      if (!hasConsecutiveWordPositions(window)) continue;
      let allMatch = true;
      for (let index = 0; index < count - 1; index += 1) {
        if (!(await this.phraseQueryTokenMatchesCandidate(queryTokens[index], window[index]))) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) continue;
      if ((await this.selectPhraseSuggestionRecord(queryTokens[count - 1], window[count - 1], true)) === null) continue;
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const record = await this.selectPhraseSuggestionRecord(queryTokens[index], window[index], index === count - 1);
        const token = window[index];
        parts.push(
          record === null
            ? formatSuggestionText(token.word_text, withChakl)
            : formatSuggestionText(stripLeadingBaseLetters(token.word_text, record.stripped_prefix_count ?? 0), withChakl),
        );
      }
      const phraseText = parts.join(" ");
      if (seen.has(phraseText)) continue;
      seen.add(phraseText);
      suggestions.push({ type: "word", text: phraseText, label: phraseText });
      if (suggestions.length >= limit) return suggestions;
    }
    return suggestions;
  }

  // --- roots ------------------------------------------------------------------

  async getRootIds(qSimple: string, mushaf: number): Promise<number[]> {
    const rootIds = new Set<number>();
    let surfaces = await this.resolveExactWordSurfaces(qSimple);
    if (!surfaces.length) surfaces = [qSimple];
    for (const row of await this.db.all("SELECT id FROM roots WHERE root_simple = ?", [qSimple])) rootIds.add(Number(row.id));
    const rows = await this.db.all(
      `SELECT DISTINCT wo.root_id FROM word_occurrences wo JOIN ayahs a ON wo.ayah_id = a.id
       WHERE wo.word_simple IN (${placeholders(surfaces)}) AND wo.root_id IS NOT NULL AND a.mushaf_id = ?`,
      [...surfaces, mushaf],
    );
    for (const row of rows) rootIds.add(Number(row.root_id));
    return [...rootIds].sort((a, b) => a - b);
  }

  async buildRootDistribution(rootQuery: string, mushaf: number) {
    const qSimple = normalizeQuerySearch(rootQuery);
    const rootIds = await this.getRootIds(qSimple, mushaf);
    if (!rootIds.length) return { found: false, root: rootQuery, total: 0, surah_count: 0, surahs: [] };
    const rows = await this.db.all(
      `SELECT a.surah_id AS surah_id, s.name_arabic AS surah, COUNT(*) AS count
       FROM word_occurrences wo JOIN ayahs a ON wo.ayah_id = a.id JOIN surahs s ON a.surah_id = s.id
       WHERE wo.root_id IN (${placeholders(rootIds)}) AND a.mushaf_id = ?
       GROUP BY a.surah_id, s.name_arabic
       ORDER BY a.surah_id`,
      [...rootIds, mushaf],
    );
    const surahs = rows.map((row) => ({ surah_id: row.surah_id, surah: row.surah, count: row.count }));
    const rootRow = await one(this.db, `SELECT root_text FROM roots WHERE id IN (${placeholders(rootIds)})`, rootIds);
    return {
      found: true,
      root: rootRow ? rootRow.root_text : rootQuery,
      total: sum(surahs.map((item) => item.count)),
      surah_count: surahs.length,
      surahs,
    };
  }

  // --- phrase metadata --------------------------------------------------------

  private async fetchMushafAyahTokens(mushaf: number): Promise<TokenAyah[]> {
    const rows = await this.db.all(
      `SELECT aw.ayah_id, aw.mushaf_id, s.name_arabic AS surah_name, aw.surah_id, aw.number_in_surah, a.text_uthmani,
              aw.global_index, aw.word_position, aw.word_text, aw.word_simple
       FROM ayah_words aw JOIN ayahs a ON aw.ayah_id = a.id JOIN surahs s ON aw.surah_id = s.id
       WHERE aw.mushaf_id = ?
       ORDER BY aw.surah_id, aw.number_in_surah, aw.word_position`,
      [mushaf],
    );
    const ayahs: TokenAyah[] = [];
    let current: TokenAyah | null = null;
    const recordCache = new Map<string, Record_[]>();
    for (const row of rows) {
      if (current === null || current.ayah_id !== row.ayah_id) {
        current = {
          ayah_id: row.ayah_id,
          mushaf_id: row.mushaf_id,
          surah_id: row.surah_id,
          surah_name: row.surah_name,
          number_in_surah: row.number_in_surah,
          text_uthmani: row.text_uthmani,
          global_index: row.global_index,
          tokens: [],
        };
        ayahs.push(current);
      }
      const key = row.word_simple + sep + row.word_text;
      if (!recordCache.has(key)) recordCache.set(key, await this.phraseSurfaceRecords(row.word_simple, row.word_text));
      current.tokens.push({ word_position: row.word_position, word_text: row.word_text, word_simple: row.word_simple, phrase_records: recordCache.get(key)! });
    }
    return ayahs;
  }

  private async phraseMetadata(mushaf: number): Promise<PhraseMetadata> {
    const cached = this.phraseMetadataCache.get(mushaf);
    if (cached) return cached;
    const ayahs = await this.fetchMushafAyahTokens(mushaf);
    const phraseForms = new Set<string>();
    const positionsByForm = new Map<string, [number, number][]>();
    const seen = new Set<string>();
    for (let ayahIndex = 0; ayahIndex < ayahs.length; ayahIndex += 1) {
      const tokens = ayahs[ayahIndex].tokens;
      for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
        for (const record of await this.candidatePhraseRecords(tokens[tokenIndex])) {
          const form = record.search_simple;
          phraseForms.add(form);
          const key = `${form}${sep}${ayahIndex}${sep}${tokenIndex}`;
          if (seen.has(key)) continue;
          seen.add(key);
          let positions = positionsByForm.get(form);
          if (!positions) positionsByForm.set(form, (positions = []));
          positions.push([ayahIndex, tokenIndex]);
        }
      }
    }
    return this.phraseMetadataCache.set(mushaf, { ayahs, phrase_forms: phraseForms, positions_by_form: positionsByForm });
  }

  private async findPhraseMatches(ayahs: TokenAyah[], queryTokens: QueryToken[], metadata: PhraseMetadata) {
    const count = queryTokens.length;
    if (count < 2) return [];
    const matches: Row[] = [];
    for (const [ayahIndex, tokenIndex] of metadata.positions_by_form.get(queryTokens[0].simple) ?? []) {
      const ayah = ayahs[ayahIndex];
      const tokens = ayah.tokens;
      if (tokenIndex + count > tokens.length) continue;
      const window = tokens.slice(tokenIndex, tokenIndex + count);
      if (!hasConsecutiveWordPositions(window)) continue;
      let allMatch = true;
      for (let index = 0; index < count; index += 1) {
        if (!(await this.phraseQueryTokenMatchesCandidate(queryTokens[index], window[index]))) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) continue;
      matches.push({
        ayah_id: ayah.ayah_id,
        mushaf_id: ayah.mushaf_id,
        surah: ayah.surah_name,
        surah_id: ayah.surah_id,
        ayah: ayah.number_in_surah,
        text: ayah.text_uthmani,
        global_index: ayah.global_index,
        highlights: window.map((token) => token.word_position),
      });
    }
    return matches;
  }

  private async buildPhraseDidYouMean(queryTokens: QueryToken[], ayahs: TokenAyah[], phraseForms: Set<string>): Promise<DidYouMean> {
    const count = queryTokens.length;
    if (count < 2) return null;
    const scoreMaps = await this.phraseSimilarityScoreMaps(queryTokens, phraseForms);
    if (scoreMaps === null) return null;
    type Candidate = { text: string; score: number; penalty: number };
    const groups = new Map<string, Candidate>();
    for (const ayah of ayahs) {
      const tokens = ayah.tokens;
      if (tokens.length < count) continue;
      for (let start = 0; start <= tokens.length - count; start += 1) {
        const window = tokens.slice(start, start + count);
        if (!hasConsecutiveWordPositions(window)) continue;
        let selections: [Record_ | null, number][] = [];
        for (let index = 0; index < count; index += 1) {
          const records = await this.candidatePhraseRecords(window[index]);
          if (!records.some((record) => scoreMaps[index].has(record.search_simple))) {
            selections = [];
            break;
          }
          selections.push(await this.selectBestPhraseCandidateRecord(queryTokens[index], window[index], scoreMaps[index]));
        }
        if (!selections.length) continue;
        const tokenScores = selections.map(([, score]) => score);
        const overall = sum(tokenScores) / count;
        if (overall < PHRASE_SUGGESTION_MIN_CONFIDENCE) continue;
        if (Math.min(...tokenScores) < PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE) continue;
        const signature = selections.map(([record], index) => (record !== null ? record.search_simple : window[index].word_simple)).join(sep);
        const phraseText = window.map((token) => plainArabicDisplayText(token.word_text)).join(" ");
        const penalty = sum(selections.map(([record]) => (record !== null ? record.stripped_prefix_count + record.stripped_article_count : 0)));
        const current = groups.get(signature);
        if (
          current === undefined ||
          overall > current.score ||
          (overall === current.score &&
            cmpKey(
              [penalty, chars(normalizeQuerySearch(phraseText)).length, phraseText],
              [current.penalty, chars(normalizeQuerySearch(current.text)).length, current.text],
            ) < 0)
        ) {
          groups.set(signature, { text: phraseText, score: overall, penalty });
        }
      }
    }
    if (!groups.size) return null;
    const ranked = sortBy([...groups.values()], (candidate) => [-candidate.score, candidate.penalty, chars(normalizeQuerySearch(candidate.text)).length, candidate.text]);
    const best = ranked[0];
    if (ranked.length > 1 && best.score - ranked[1].score < PHRASE_SUGGESTION_MIN_LEAD) return null;
    return { text: best.text, confidence: pyRound3(best.score) };
  }

  private async wordSuggestionCandidates(mushaf: number) {
    const cached = this.wordCandidatesCache.get(mushaf);
    if (cached) return cached;
    const rows = await this.db.all("SELECT DISTINCT word_text, word_simple FROM ayah_words WHERE mushaf_id = ? ORDER BY word_simple, word_text", [mushaf]);
    const candidates = new Map<string, { search_simple: string; text: string; penalty: number }>();
    const recordCache = new Map<string, Record_[]>();
    for (const row of rows) {
      const defaultDisplay = plainArabicDisplayText(row.word_text);
      candidates.set(row.word_simple + sep + defaultDisplay, { search_simple: row.word_simple, text: defaultDisplay, penalty: 0 });
      if (!recordCache.has(row.word_simple)) recordCache.set(row.word_simple, await this.variantRecords(row.word_simple, "word"));
      for (const record of recordCache.get(row.word_simple)!) {
        const text = plainArabicDisplayText(buildCandidateSurfaceText(row.word_text, record));
        if (!text) continue;
        const key = record.search_simple + sep + text;
        const penalty = record.stripped_prefix_count + record.stripped_article_count;
        const existing = candidates.get(key);
        if (existing === undefined || penalty < existing.penalty) candidates.set(key, { search_simple: record.search_simple, text, penalty });
      }
    }
    return this.wordCandidatesCache.set(mushaf, [...candidates.values()]);
  }

  async buildWordDidYouMean(qSimple: string, mushaf: number): Promise<DidYouMean> {
    if (!qSimple || qSimple.includes(" ")) return null;
    const cacheKey = `${mushaf}${sep}${qSimple}`;
    if (this.wordDidYouMeanCache.has(cacheKey)) return this.wordDidYouMeanCache.get(cacheKey)!;
    type Ranked = { text: string; score: number; penalty: number; length_delta: number };
    const ranked: Ranked[] = [];
    const queryChars = chars(qSimple);
    const queryLength = queryChars.length;
    for (const candidate of await this.wordSuggestionCandidates(mushaf)) {
      const candidateSimple = candidate.search_simple;
      if (!candidateSimple) continue;
      const candidateChars = chars(candidateSimple);
      if (candidateChars[0] !== queryChars[0]) continue;
      if (Math.min(candidateChars.length, queryLength) / Math.max(candidateChars.length, queryLength) < 0.66) continue;
      const score = sequenceRatio(qSimple, candidateSimple);
      if (score < WORD_SUGGESTION_MIN_CONFIDENCE) continue;
      ranked.push({ text: candidate.text, score, penalty: candidate.penalty, length_delta: Math.abs(candidateChars.length - queryLength) });
    }
    if (!ranked.length) return this.wordDidYouMeanCache.set(cacheKey, null);
    const sorted = sortBy(ranked, (candidate) => [-candidate.score, candidate.penalty, candidate.length_delta, chars(candidate.text).length, candidate.text]);
    const best = sorted[0];
    if (sorted.length > 1 && best.score - sorted[1].score < WORD_SUGGESTION_MIN_LEAD && best.text !== sorted[1].text) {
      return this.wordDidYouMeanCache.set(cacheKey, null);
    }
    return this.wordDidYouMeanCache.set(cacheKey, { text: best.text, confidence: pyRound3(best.score) });
  }

  private async searchExactPhraseMatches(q: string, mushaf: number): Promise<[QueryToken[], Row[], DidYouMean]> {
    const queryTokens = tokenizeExactQuery(q);
    const metadata = await this.phraseMetadata(mushaf);
    const possible = queryTokens.every((token) => metadata.phrase_forms.has(token.simple));
    const matches = possible ? await this.findPhraseMatches(metadata.ayahs, queryTokens, metadata) : [];
    let didYouMean: DidYouMean = null;
    if (!matches.length) {
      const cacheKey = `${mushaf}${sep}${queryTokens.map((token) => token.simple).join(sep)}`;
      if (this.phraseDidYouMeanCache.has(cacheKey)) didYouMean = this.phraseDidYouMeanCache.get(cacheKey)!;
      else didYouMean = this.phraseDidYouMeanCache.set(cacheKey, await this.buildPhraseDidYouMean(queryTokens, metadata.ayahs, metadata.phrase_forms));
    }
    return [queryTokens, matches, didYouMean];
  }

  // --- exact / root occurrences -----------------------------------------------

  private async fetchExactCandidateRows(qSimple: string, mushaf: number): Promise<Row[]> {
    const surfaces = await this.resolveExactWordSurfaces(qSimple);
    if (!surfaces.length) return [];
    return this.db.all(
      `SELECT a.id AS ayah_id, a.mushaf_id, s.name_arabic AS surah_name, a.surah_id, a.number_in_surah, a.text_uthmani,
              a.global_index, aw.word_position, aw.word_text, aw.word_simple
       FROM ayah_words aw JOIN ayahs a ON aw.ayah_id = a.id JOIN surahs s ON a.surah_id = s.id
       WHERE aw.word_simple IN (${placeholders(surfaces)}) AND a.mushaf_id = ?
       ORDER BY a.surah_id, a.number_in_surah`,
      [...surfaces, mushaf],
    );
  }

  private async exactCandidateMatchesQuery(candidate: Row, query: string, qSimple: string): Promise<boolean> {
    if (!hasQueryDiacritics(query)) return true;
    const queryStandard = standardizeUthmani(strip(query));
    const forms = await this.variantRecordsAnyScope(candidate.word_simple);
    if (forms.length) {
      for (const record of forms) {
        if (record.search_simple !== qSimple) continue;
        if (uthmaniMatchesQuery(queryStandard, buildCandidateSurfaceText(candidate.word_text, record))) return true;
      }
      return candidate.word_simple === qSimple && uthmaniMatchesQuery(queryStandard, candidate.word_text);
    }
    return uthmaniMatchesQuery(queryStandard, candidate.word_text);
  }

  private async filterExactOccurrences(rows: Row[], query: string, qSimple: string): Promise<Row[]> {
    if (!rows.length) return [];
    if (!hasQueryDiacritics(query)) return [...rows];
    const kept: Row[] = [];
    for (const row of rows) if (await this.exactCandidateMatchesQuery(row, query, qSimple)) kept.push(row);
    return kept;
  }

  private async fetchRootOccurrenceRows(rootId: number, mushaf: number): Promise<Row[]> {
    return this.db.all(
      `SELECT a.id AS ayah_id, a.mushaf_id, s.name_arabic AS surah_name, a.surah_id, a.number_in_surah, a.text_uthmani,
              a.global_index, wo.word_position
       FROM word_occurrences wo JOIN ayahs a ON wo.ayah_id = a.id JOIN surahs s ON a.surah_id = s.id
       WHERE wo.root_id = ? AND a.mushaf_id = ?
       ORDER BY a.surah_id, a.number_in_surah`,
      [rootId, mushaf],
    );
  }

  /** Root counts for paginated search (within one surah when given). */
  private async fetchRootSummary(rootId: number, mushaf: number, surah: number | null = null): Promise<[number, number, number]> {
    const row = (await one(
      this.db,
      `SELECT COUNT(*) AS total_occurrences, COUNT(DISTINCT wo.ayah_id) AS total_verses, COUNT(DISTINCT a.surah_id) AS total_surahs
       FROM word_occurrences wo JOIN ayahs a ON wo.ayah_id = a.id
       WHERE wo.root_id = ? AND a.mushaf_id = ?${surah !== null ? " AND a.surah_id = ?" : ""}`,
      [rootId, mushaf, ...(surah !== null ? [surah] : [])],
    ))!;
    return [row.total_occurrences, row.total_verses, row.total_surahs];
  }

  /** One page of a root's verses (within one surah when given). */
  private async fetchRootPageVerses(rootId: number, mushaf: number, page: number, pageSize: number, surah: number | null = null) {
    const offset = (page - 1) * pageSize;
    const ayahRows = await this.db.all(
      `SELECT a.id AS ayah_id, a.mushaf_id, s.name_arabic AS surah_name, a.surah_id, a.number_in_surah, a.text_uthmani, a.global_index
       FROM word_occurrences wo JOIN ayahs a ON wo.ayah_id = a.id JOIN surahs s ON a.surah_id = s.id
       WHERE wo.root_id = ? AND a.mushaf_id = ?${surah !== null ? " AND a.surah_id = ?" : ""}
       GROUP BY a.id, s.name_arabic, a.surah_id, a.number_in_surah, a.text_uthmani
       ORDER BY a.surah_id, a.number_in_surah
       LIMIT ? OFFSET ?`,
      [rootId, mushaf, ...(surah !== null ? [surah] : []), pageSize, offset],
    );
    const ayahIds = ayahRows.map((row) => row.ayah_id as number);
    const highlights = new Map<number, number[]>(ayahIds.map((id) => [id, []]));
    if (ayahIds.length) {
      const rows = await this.db.all(
        `SELECT ayah_id, word_position FROM word_occurrences
         WHERE root_id = ? AND ayah_id IN (${placeholders(ayahIds)})
         ORDER BY ayah_id, word_position`,
        [rootId, ...ayahIds],
      );
      for (const row of rows) highlights.get(row.ayah_id)!.push(row.word_position);
    }
    return ayahRows.map((row) => ({
      ayah_id: row.ayah_id,
      mushaf_id: row.mushaf_id,
      surah: row.surah_name,
      surah_id: row.surah_id,
      ayah: row.number_in_surah,
      text: row.text_uthmani,
      global_index: row.global_index,
      highlights: highlights.get(row.ayah_id) ?? [],
    }));
  }

  // --- search payloads ----------------------------------------------------------

  async buildLegacyExactResults(q: string, qSimple: string, mushaf: number): Promise<[Row[], DidYouMean]> {
    const queryTokens = tokenizeExactQuery(q);
    const displayQuery = buildExactQueryLabel(q, queryTokens);
    if (queryTokens.length > 1) {
      const [phraseTokens, matches, didYouMean] = await this.searchExactPhraseMatches(q, mushaf);
      if (!matches.length) return [[], didYouMean];
      const verses = phraseMatchesToVerseList(matches);
      return [
        [
          {
            root: buildExactQueryLabel(q, phraseTokens),
            root_id: null,
            total_occurrences: matches.length,
            total_verses: verses.length,
            verses,
            search_type: "exact",
            match_type: "phrase",
          },
        ],
        null,
      ];
    }
    const occurrences = await this.filterExactOccurrences(await this.fetchExactCandidateRows(qSimple, mushaf), q, qSimple);
    if (!occurrences.length) return [[], await this.buildWordDidYouMean(qSimple, mushaf)];
    const verses = occurrencesToVerseList(occurrences);
    return [
      [{ root: displayQuery, root_id: null, total_occurrences: occurrences.length, total_verses: verses.length, verses, search_type: "exact", match_type: "word" }],
      null,
    ];
  }

  async buildLegacyRootResults(qSimple: string, mushaf: number): Promise<Row[]> {
    const results: Row[] = [];
    for (const rootId of await this.getRootIds(qSimple, mushaf)) {
      const info = await one(this.db, "SELECT root_text FROM roots WHERE id = ?", [rootId]);
      if (!info) continue;
      const occurrences = await this.fetchRootOccurrenceRows(rootId, mushaf);
      if (!occurrences.length) continue;
      const verses = occurrencesToVerseList(occurrences);
      results.push({ root: info.root_text, root_id: rootId, total_occurrences: occurrences.length, total_verses: verses.length, verses, search_type: "root" });
    }
    return results;
  }

  private async buildPaginatedExactResult(q: string, qSimple: string, mushaf: number, page: number, pageSize: number, surah: number | null = null): Promise<Row | null> {
    const queryTokens = tokenizeExactQuery(q);
    const displayQuery = buildExactQueryLabel(q, queryTokens);
    let root: string;
    let matchType: "phrase" | "word";
    let totalOccurrences: number;
    let verseList: Row[];
    if (queryTokens.length > 1) {
      const [phraseTokens, allMatches] = await this.searchExactPhraseMatches(q, mushaf);
      const matches = surah !== null ? allMatches.filter((match) => match.surah_id === surah) : allMatches;
      if (!matches.length) return null;
      verseList = phraseMatchesToVerseList(matches);
      totalOccurrences = matches.length;
      root = buildExactQueryLabel(q, phraseTokens);
      matchType = "phrase";
    } else {
      const allOccurrences = await this.filterExactOccurrences(await this.fetchExactCandidateRows(qSimple, mushaf), q, qSimple);
      const occurrences = surah !== null ? allOccurrences.filter((occurrence) => occurrence.surah_id === surah) : allOccurrences;
      if (!occurrences.length) return null;
      verseList = occurrencesToVerseList(occurrences);
      totalOccurrences = occurrences.length;
      root = displayQuery;
      matchType = "word";
    }
    const totalVerses = verseList.length;
    const totalPages = computeTotalPages(totalVerses, pageSize);
    page = clampPage(page, totalPages);
    const start = (page - 1) * pageSize;
    return {
      result_key: `exact:${qSimple}`,
      root,
      root_id: null,
      search_type: "exact",
      match_type: matchType,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      total_occurrences: totalOccurrences,
      total_verses: totalVerses,
      total_surahs: new Set(verseList.map((verse) => verse.surah_id)).size,
      verses: verseList.slice(start, start + pageSize),
    };
  }

  private async buildPaginatedRootResult(rootId: number, mushaf: number, page: number, pageSize: number, surah: number | null = null): Promise<Row | null> {
    const info = await one(this.db, "SELECT root_text FROM roots WHERE id = ?", [rootId]);
    if (!info) return null;
    const [totalOccurrences, totalVerses, totalSurahs] = await this.fetchRootSummary(rootId, mushaf, surah);
    if (!totalOccurrences || !totalVerses) return null;
    const totalPages = computeTotalPages(totalVerses, pageSize);
    page = clampPage(page, totalPages);
    return {
      result_key: `root:${rootId}`,
      root: info.root_text,
      root_id: rootId,
      search_type: "root",
      page,
      page_size: pageSize,
      total_pages: totalPages,
      total_occurrences: totalOccurrences,
      total_verses: totalVerses,
      total_surahs: totalSurahs,
      verses: await this.fetchRootPageVerses(rootId, mushaf, page, pageSize, surah),
    };
  }

  async buildPaginatedSearchResults(q: string, qSimple: string, mode: string, mushaf: number, pageSize: number, surah: number | null = null): Promise<[Row[], DidYouMean]> {
    if (!qSimple) return [[], null];
    if (mode === "exact") {
      const queryTokens = tokenizeExactQuery(q);
      let didYouMean: DidYouMean = null;
      if (queryTokens.length > 1) {
        const [, matches, phraseDidYouMean] = await this.searchExactPhraseMatches(q, mushaf);
        didYouMean = phraseDidYouMean;
        if (!matches.length) return [[], didYouMean];
      }
      const result = await this.buildPaginatedExactResult(q, qSimple, mushaf, 1, pageSize, surah);
      if (result) return [[result], didYouMean];
      // The words exist elsewhere: no spelling suggestion for an empty surah.
      if (surah !== null) return [[], null];
      if (queryTokens.length === 1) didYouMean = await this.buildWordDidYouMean(qSimple, mushaf);
      return [[], didYouMean];
    }
    const results: Row[] = [];
    for (const rootId of await this.getRootIds(qSimple, mushaf)) {
      const result = await this.buildPaginatedRootResult(rootId, mushaf, 1, pageSize, surah);
      if (result !== null) results.push(result);
    }
    return [results, null];
  }

  async buildSingleResultPage(q: string, qSimple: string, mode: string, mushaf: number, resultKey: string, page: number, pageSize: number, surah: number | null = null): Promise<Row | null> {
    if (!qSimple) return null;
    if (mode === "exact") {
      if (resultKey !== `exact:${qSimple}`) return null;
      return this.buildPaginatedExactResult(q, qSimple, mushaf, page, pageSize, surah);
    }
    if (!resultKey.startsWith("root:")) return null;
    const rootId = parsePyInt(resultKey.slice(5));
    if (rootId === null) return null;
    if (!(await this.getRootIds(qSimple, mushaf)).includes(rootId)) return null;
    return this.buildPaginatedRootResult(rootId, mushaf, page, pageSize, surah);
  }

  // --- reader -------------------------------------------------------------------

  private async surahAyahRange(mushaf: number, surahId: number, start: number, end: number, centerAyahId: number | null = null) {
    const rows = await this.db.all(
      `SELECT a.id AS ayah_id, a.mushaf_id, a.surah_id, a.number_in_surah, a.text_uthmani, a.global_index, s.name_arabic AS surah_name
       FROM ayahs a JOIN surahs s ON a.surah_id = s.id
       WHERE a.mushaf_id = ? AND a.surah_id = ? AND a.number_in_surah BETWEEN ? AND ?
       ORDER BY a.number_in_surah`,
      [mushaf, surahId, start, end],
    );
    return rows.map((row) => ({
      ayah_id: row.ayah_id,
      ayah: row.number_in_surah,
      text: row.text_uthmani,
      global_index: row.global_index,
      is_center: row.ayah_id === centerAyahId,
    }));
  }

  private async surahBounds(mushaf: number, surahId: number) {
    return (await one(this.db, "SELECT MIN(number_in_surah) AS min_ayah, MAX(number_in_surah) AS max_ayah FROM ayahs WHERE mushaf_id = ? AND surah_id = ?", [
      mushaf,
      surahId,
    ]))!;
  }

  async buildAyahReaderPayload(mushaf: number, ayahId: number, before: number, after: number) {
    const center = await one(
      this.db,
      `SELECT a.id AS ayah_id, a.mushaf_id, a.surah_id, a.number_in_surah, a.text_uthmani, a.global_index, s.name_arabic AS surah_name
       FROM ayahs a JOIN surahs s ON a.surah_id = s.id
       WHERE a.id = ? AND a.mushaf_id = ?`,
      [ayahId, mushaf],
    );
    if (center === null) return { found: false, ayahs: [] };
    const { min_ayah: minAyah, max_ayah: maxAyah } = await this.surahBounds(mushaf, center.surah_id);
    const start = Math.max(minAyah, center.number_in_surah - before);
    const end = Math.min(maxAyah, center.number_in_surah + after);
    return {
      found: true,
      mushaf_id: center.mushaf_id,
      surah_id: center.surah_id,
      surah: center.surah_name,
      center_ayah_id: center.ayah_id,
      start_ayah: start,
      end_ayah: end,
      has_previous: start > minAyah,
      has_next: end < maxAyah,
      ayahs: await this.surahAyahRange(mushaf, center.surah_id, start, end, center.ayah_id),
    };
  }

  async buildAyahReaderMorePayload(mushaf: number, surahId: number, anchorAyah: number, direction: string, count: number) {
    const { min_ayah: minAyah, max_ayah: maxAyah } = await this.surahBounds(mushaf, surahId);
    if (minAyah === null || maxAyah === null) return { found: false, ayahs: [] };
    let ayahs;
    let hasMore: boolean;
    if (direction === "before") {
      const end = Math.min(maxAyah, anchorAyah - 1);
      if (end < minAyah) return { found: true, surah_id: surahId, direction, has_more: false, ayahs: [] };
      const start = Math.max(minAyah, end - count + 1);
      ayahs = await this.surahAyahRange(mushaf, surahId, start, end);
      hasMore = start > minAyah;
    } else {
      const start = Math.max(minAyah, anchorAyah + 1);
      if (start > maxAyah) return { found: true, surah_id: surahId, direction, has_more: false, ayahs: [] };
      const end = Math.min(maxAyah, start + count - 1);
      ayahs = await this.surahAyahRange(mushaf, surahId, start, end);
      hasMore = end < maxAyah;
    }
    return { found: true, surah_id: surahId, direction, has_more: hasMore, ayahs };
  }

  private async mushafPageIndex(mushaf: number): Promise<PageIndex> {
    const cached = this.pageIndexCache.get(mushaf);
    if (cached) return cached;
    const rows = await this.db.all(
      `SELECT a.id AS ayah_id, a.mushaf_id, a.surah_id, a.number_in_surah, a.text_uthmani, a.global_index, a.page, a.juz,
              a.line_start, a.line_end, s.name_arabic AS surah_name
       FROM ayahs a JOIN surahs s ON a.surah_id = s.id
       WHERE a.mushaf_id = ? AND a.page IS NOT NULL
       ORDER BY a.global_index, a.surah_id, a.number_in_surah`,
      [mushaf],
    );
    const pageNumbers = new Set<number>();
    const pageToAyahs = new Map<number, Row[]>();
    const ayahToPrimaryPage = new Map<number, number>();
    for (const row of rows) {
      const span = parsePageSpan(row.page);
      if (span === null) continue;
      const payload = {
        ayah_id: row.ayah_id,
        mushaf_id: row.mushaf_id,
        surah_id: row.surah_id,
        surah: row.surah_name,
        ayah: row.number_in_surah,
        text: row.text_uthmani,
        global_index: row.global_index,
        page: row.page,
        juz: row.juz,
        line_start: row.line_start,
        line_end: row.line_end,
      };
      ayahToPrimaryPage.set(row.ayah_id, span[0]);
      for (let page = span[0]; page <= span[1]; page += 1) {
        pageNumbers.add(page);
        let list = pageToAyahs.get(page);
        if (!list) pageToAyahs.set(page, (list = []));
        list.push(payload);
      }
    }
    const numbers = [...pageNumbers];
    const index: PageIndex = numbers.length
      ? { min_page: Math.min(...numbers), max_page: Math.max(...numbers), page_count: numbers.length, page_to_ayahs: pageToAyahs, ayah_to_primary_page: ayahToPrimaryPage }
      : { min_page: null, max_page: null, page_count: 0, page_to_ayahs: new Map(), ayah_to_primary_page: new Map() };
    return this.pageIndexCache.set(mushaf, index);
  }

  private async mushafLayoutIndex(): Promise<Row> {
    if (this.layoutIndex) return this.layoutIndex;
    const present = await one(this.db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mushaf_layout_meta'");
    if (!present) return (this.layoutIndex = { present: false });
    const meta = await one(this.db, "SELECT layout_id, mushaf_id, page_count FROM mushaf_layout_meta LIMIT 1");
    if (!meta) return (this.layoutIndex = { present: false });
    const surahNames = new Map<number, string>();
    for (const row of await this.db.all("SELECT id, name_arabic FROM surahs")) surahNames.set(row.id, row.name_arabic);
    const rows = await this.db.all(
      `SELECT l.id AS line_id, l.page, l.line_number, l.line_type, l.is_centered, l.surah_number, l.line_glyph_v1,
              w.surah_number AS w_surah, w.ayah_number, w.word_position, w.ayah_id, w.glyph_v1, w.word_text
       FROM mushaf_layout_lines l LEFT JOIN mushaf_layout_words w ON w.line_id = l.id
       WHERE l.mushaf_id = ?
       ORDER BY l.page, l.line_number, w.position_in_line`,
      [meta.mushaf_id],
    );
    const pages = new Map<number, Row[]>();
    const pageSurahs = new Map<number, Map<number, string>>();
    const lineById = new Map<number, Row>();
    for (const row of rows) {
      let line = lineById.get(row.line_id);
      if (!line) {
        const lineType = row.line_type;
        const fontFamily = lineType === "ayah" ? `qcf-p${row.page}` : lineType === "basmalah" ? "qcf-bsml" : null;
        line = {
          line_number: row.line_number,
          line_type: lineType,
          is_centered: Boolean(row.is_centered),
          surah_number: row.surah_number,
          surah_name: lineType === "surah_name" ? (surahNames.get(row.surah_number) ?? null) : null,
          glyph: lineType === "basmalah" ? row.line_glyph_v1 : null,
          font_family: fontFamily,
          words: [],
        };
        lineById.set(row.line_id, line);
        if (!pages.has(row.page)) pages.set(row.page, []);
        pages.get(row.page)!.push(line);
      }
      if (row.w_surah !== null && row.w_surah !== undefined) {
        const surah = row.w_surah;
        line.words.push({
          glyph: row.glyph_v1,
          surah,
          ayah: row.ayah_number,
          word_position: row.word_position,
          ayah_id: row.ayah_id,
          word_key: `${surah}:${row.ayah_number}:${row.word_position}`,
          text: row.word_text,
        });
        if (!pageSurahs.has(row.page)) pageSurahs.set(row.page, new Map());
        const surahsOnPage = pageSurahs.get(row.page)!;
        if (!surahsOnPage.has(surah)) surahsOnPage.set(surah, surahNames.get(surah) ?? "");
      }
    }
    const pageNumbers = [...pages.keys()].sort((a, b) => a - b);
    return (this.layoutIndex = {
      present: true,
      layout_id: meta.layout_id,
      min_page: pageNumbers.length ? pageNumbers[0] : null,
      max_page: pageNumbers.length ? pageNumbers[pageNumbers.length - 1] : null,
      pages,
      page_surahs: pageSurahs,
    });
  }

  async buildMushafPageLayout(mushaf: number, page: number | null = null, selectedAyahId: number | null = null) {
    if (mushaf !== HAFS_MUSHAF_ID) return { found: false, fallback: "reader" };
    const index = await this.mushafLayoutIndex();
    if (!index.present) return { found: false, fallback: "reader" };
    const { min_page: minPage, max_page: maxPage } = index;
    if (minPage === null) return { found: false, fallback: "reader" };
    if (page === null) page = minPage as number;
    if (page < minPage || page > maxPage) return { found: false };
    const lines = ((index.pages as Map<number, Row[]>).get(page) ?? []).map((line) => ({
      ...line,
      words: line.words.map((word: Row) => ({ ...word, is_selected: selectedAyahId !== null && word.ayah_id === selectedAyahId })),
    }));
    const surahs = [...((index.page_surahs as Map<number, Map<number, string>>).get(page) ?? new Map()).entries()].map(([id, name]) => ({ id, name }));
    return {
      found: true,
      mushaf_id: mushaf,
      page,
      min_page: minPage,
      max_page: maxPage,
      has_previous: page > minPage,
      has_next: page < maxPage,
      selected_ayah_id: selectedAyahId,
      layout_id: index.layout_id,
      font_base_path: MUSHAF_FONT_BASE_PATH,
      surahs,
      lines,
    };
  }

  private async resolveLocatorAyahId(mushaf: number, surah: number | null, ayah: number | null, juz: number | null): Promise<number | null> {
    if (juz !== null) {
      const row = await one(this.db, "SELECT id FROM ayahs WHERE mushaf_id = ? AND juz = ? ORDER BY global_index LIMIT 1", [mushaf, juz]);
      return row ? row.id : null;
    }
    if (surah !== null) {
      const target = ayah !== null ? ayah : 1;
      const row = await one(this.db, "SELECT id FROM ayahs WHERE mushaf_id = ? AND surah_id = ? AND number_in_surah = ?", [mushaf, surah, target]);
      if (row) return row.id;
      const first = await one(this.db, "SELECT id FROM ayahs WHERE mushaf_id = ? AND surah_id = ? ORDER BY number_in_surah LIMIT 1", [mushaf, surah]);
      return first ? first.id : null;
    }
    return null;
  }

  async buildQuranPagePayload(
    mushaf: number,
    page: number | null = null,
    ayahId: number | null = null,
    selectedAyahId: number | null = null,
    surah: number | null = null,
    ayah: number | null = null,
    juz: number | null = null,
  ) {
    const index = await this.mushafPageIndex(mushaf);
    if (index.min_page === null || index.max_page === null) return { found: false, ayahs: [] };
    const minPage = index.min_page;
    const maxPage = index.max_page;
    let targetPage = page;
    if (ayahId === null) {
      const locator = await this.resolveLocatorAyahId(mushaf, surah, ayah, juz);
      if (locator !== null) ayahId = locator;
    }
    if (ayahId !== null) {
      const primary = index.ayah_to_primary_page.get(ayahId);
      if (primary === undefined) return { found: false, ayahs: [] };
      targetPage = primary;
      selectedAyahId = ayahId;
    }
    if (targetPage === null) targetPage = minPage;
    targetPage = Math.max(minPage, Math.min(targetPage, maxPage));
    const ayahs = (index.page_to_ayahs.get(targetPage) ?? []).map((item): Row => ({ ...item, is_selected: item.ayah_id === selectedAyahId }));
    if (!ayahs.length) return { found: false, ayahs: [] };
    const surahs: { id: number; name: string }[] = [];
    const seenSurahs = new Set<number>();
    const juzs: number[] = [];
    for (const item of ayahs) {
      if (!seenSurahs.has(item.surah_id)) {
        seenSurahs.add(item.surah_id);
        surahs.push({ id: item.surah_id, name: item.surah });
      }
      if (item.juz !== null && item.juz !== undefined && !juzs.includes(item.juz)) juzs.push(item.juz);
    }
    return {
      found: true,
      mushaf_id: mushaf,
      page: targetPage,
      min_page: minPage,
      max_page: maxPage,
      total_pages: maxPage,
      page_count: index.page_count,
      has_previous: targetPage > minPage,
      has_next: targetPage < maxPage,
      selected_ayah_id: selectedAyahId,
      juz: juzs.length ? juzs[0] : null,
      juz_secondary: juzs.length > 1 ? juzs[1] : null,
      surahs,
      ayahs,
    };
  }
}

// --- module helpers -------------------------------------------------------------

export function phraseOccurrences(tokens: string[], phrase: string[]): number {
  const size = phrase.length;
  if (size === 0 || size > tokens.length) return 0;
  let count = 0;
  for (let start = 0; start <= tokens.length - size; start += 1) {
    if (phrase.every((token, offset) => tokens[start + offset] === token)) count += 1;
  }
  return count;
}

export function hasConsecutiveWordPositions(window: { word_position: number }[]): boolean {
  return window.every((token, index) => token.word_position === window[0].word_position + index);
}

function phraseMatchesToVerseList(matches: Row[]): Row[] {
  const verses = new Map<string, Row>();
  for (const match of matches) {
    const key = `${match.surah_id}:${match.ayah}`;
    if (!verses.has(key)) verses.set(key, { ...match, highlights: [] });
    verses.get(key)!.highlights.push(...match.highlights);
  }
  const list = [...verses.values()];
  for (const verse of list) verse.highlights = [...new Set<number>(verse.highlights)].sort((a, b) => a - b);
  return list;
}

function occurrencesToVerseList(occurrences: Row[]): Row[] {
  const verses = new Map<string, Row>();
  for (const occurrence of occurrences) {
    const key = `${occurrence.surah_id}:${occurrence.number_in_surah}`;
    if (!verses.has(key)) {
      verses.set(key, {
        ayah_id: occurrence.ayah_id,
        mushaf_id: occurrence.mushaf_id,
        surah: occurrence.surah_name,
        surah_id: occurrence.surah_id,
        ayah: occurrence.number_in_surah,
        text: occurrence.text_uthmani,
        global_index: occurrence.global_index,
        highlights: [],
      });
    }
    verses.get(key)!.highlights.push(occurrence.word_position);
  }
  return [...verses.values()];
}

export function computeTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampPage(page: number, totalPages: number): number {
  return Math.max(1, Math.min(page, totalPages));
}

/** parse_page_span: a page value can be a number or a boundary range like "85-86". */
export function parsePageSpan(value: unknown): [number, number] | null {
  if (value === null || value === undefined) return null;
  const numbers = (String(value).match(/\d+/g) ?? []).map(Number);
  if (!numbers.length) return null;
  return [Math.min(...numbers), Math.max(...numbers)];
}

/** Python `int(text)`: optional sign, digits, surrounding whitespace, underscores between digits. */
export function parsePyInt(text: string): number | null {
  const match = /^\s*([+-]?\d+(?:_\d+)*)\s*$/.exec(text);
  return match ? Number(match[1].replaceAll("_", "")) : null;
}

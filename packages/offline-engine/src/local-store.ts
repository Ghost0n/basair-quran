/**
 * The user's own data on the device — notebook, themes (with boards), research
 * sessions, followed roots, research documents and preferences — answering the
 * companion routes (src/app/routes/companions.py) with the server's behaviour:
 * the same validation, limits, ordering, defaults and response shapes, ported
 * from app_data_service.py and research_document_service.py.
 *
 * Storage is one JSON document (the data is small and personal), saved through
 * a `StateStorage` after every change; writes are serialized. Every row keeps
 * its timestamps and deletions leave a tombstone, which is what account sync
 * needs to merge the device with the account later.
 */
import { normalizeCountText } from "./normalize";
import {
  DEFAULT_MUSHAF_EDITION,
  DEFAULT_PREFERENCES,
  MAX_DOCUMENTS_PER_USER,
  MAX_DOCUMENT_BYTES,
  MAX_SESSION_MESSAGES_BYTES,
  MAX_THEMES_PER_ITEM,
  MAX_THEMES_PER_USER,
  MAX_THEME_BOARD_BYTES,
  MUSHAF_EDITION_IDS,
  RESEARCH_DOCUMENT_VERSION,
  THEME_COLORS,
} from "./models.generated";
import { strip } from "./py";
import type { QuranEngine } from "./quran";
import { type Issue, dropNone, shapeList, shapeModel, validateModel } from "./shape";

export interface StateStorage {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

/** In-memory storage (tests, or a browser preview without persistence). */
export class MemoryStorage implements StateStorage {
  constructor(private text: string | null = null) {}
  async read() {
    return this.text;
  }
  async write(text: string) {
    this.text = text;
  }
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** A deleted row; `remote_id` when the account has it too (sync deletes it there). */
export type Tombstone = { kind: CollectionName; id: number | string; deleted_at: number; remote_id?: number | string };
export type CollectionName = "notebook" | "themes" | "sessions" | "roots" | "documents";

export type LocalState = {
  format: 1;
  seq: { notebook: number; themes: number; roots: number };
  notebook: Json[];
  themes: Json[];
  sessions: Json[];
  roots: Json[];
  documents: Json[];
  preferences: { data: Json; updated_at: number; dirty?: boolean } | null;
  tombstones: Tombstone[];
  /** The account this device last synced with (null: never signed in). */
  account?: number | null;
  last_sync?: number | null;
};

export const emptyState = (): LocalState => ({
  format: 1,
  seq: { notebook: 0, themes: 0, roots: 0 },
  notebook: [],
  themes: [],
  sessions: [],
  roots: [],
  documents: [],
  preferences: null,
  tombstones: [],
});

export class HttpError extends Error {
  constructor(readonly status: number, readonly detail: unknown) {
    super(typeof detail === "string" ? detail : "validation error");
  }
}

/** Python's json.dumps(value, ensure_ascii=False): the server measures sizes on this form. */
export function pyJsonDumps(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pyJsonDumps).join(", ")}]`;
  return `{${Object.entries(value as Json).map(([key, item]) => `${JSON.stringify(key)}: ${pyJsonDumps(item)}`).join(", ")}}`;
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

function tokenUrlsafe(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  let binary = "";
  buffer.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Newest first, like `ORDER BY <key> DESC` over the server's (user, key) index: ties by insertion, newest first. */
const newestFirst = (rows: Json[], key: string) =>
  rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row[key] - a.row[key] || b.index - a.index)
    .map(({ row }) => row);

export type LocalStoreOptions = {
  storage: StateStorage;
  /** For quoted-ayah verification in research documents. */
  quran: QuranEngine;
  /** Seconds since the epoch (injectable for tests). */
  clock?: () => number;
};

export class LocalStore {
  private state: LocalState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly clock: () => number;

  constructor(private readonly options: LocalStoreOptions) {
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
  }

  private async load(): Promise<LocalState> {
    if (!this.state) {
      const text = await this.options.storage.read();
      this.state = text ? { ...emptyState(), ...(JSON.parse(text) as LocalState) } : emptyState();
    }
    return this.state;
  }

  /** Run one operation at a time; persist when it changed something. */
  private run<T>(operation: (state: LocalState) => T | Promise<T>, write: boolean): Promise<T> {
    const next = this.queue.then(async () => {
      const state = await this.load();
      const result = await operation(state);
      if (write) await this.options.storage.write(JSON.stringify(state));
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The whole local state (for account sync). */
  snapshot(): Promise<LocalState> {
    return this.run((state) => structuredClone(state), false);
  }

  /** Replace the whole local state (after account sync). */
  replace(next: LocalState): Promise<void> {
    return this.run((state) => {
      Object.assign(state, emptyState(), structuredClone(next));
    }, true);
  }

  private bury(state: LocalState, kind: CollectionName, id: number | string, remoteId?: number | string) {
    state.tombstones.push({ kind, id, deleted_at: this.clock(), ...(remoteId !== undefined ? { remote_id: remoteId } : {}) });
  }

  /**
   * Run `operation` alone (no other read or write in between) and persist the
   * state afterwards even if it fails half-way (account sync: the ids it
   * already obtained must not be lost).
   */
  exclusive<T>(operation: (state: LocalState) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const state = await this.load();
      try {
        return await operation(state);
      } finally {
        await this.options.storage.write(JSON.stringify(state));
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  // --- preferences ----------------------------------------------------------

  private preferences(state: LocalState): Json {
    const merged: Json = structuredClone(DEFAULT_PREFERENCES);
    const stored = state.preferences?.data;
    if (stored) {
      for (const [key, value] of Object.entries(stored)) if (value !== null && value !== undefined) merged[key] = value;
      merged.research = { ...DEFAULT_PREFERENCES.research, ...(stored.research || {}) };
    }
    if (!MUSHAF_EDITION_IDS.includes(merged.mushaf_edition)) merged.mushaf_edition = DEFAULT_MUSHAF_EDITION;
    return merged;
  }

  getPreferences(): Promise<Json> {
    return this.run((state) => shapeModel("UserPreferences", this.preferences(state)), false);
  }

  updatePreferences(body: unknown): Promise<Json> {
    const patch = dropNone(valid("UserPreferencesUpdate", body)) as Json;
    return this.run((state) => {
      const current = this.preferences(state);
      const research = patch.research;
      delete patch.research;
      for (const [key, value] of Object.entries(patch)) if (value !== null && value !== undefined) current[key] = value;
      if (research && Object.keys(research).length) current.research = { ...current.research, ...research };
      state.preferences = { data: current, updated_at: this.clock(), dirty: true };
      return shapeModel("UserPreferences", current);
    }, true);
  }

  // --- notebook ---------------------------------------------------------------

  private ownedThemeIds(state: LocalState, ids: number[]): number[] {
    const wanted = [...new Set(ids.map(Number))].slice(0, MAX_THEMES_PER_ITEM);
    const owned = new Set(state.themes.map((theme) => theme.id));
    return wanted.filter((id) => owned.has(id));
  }

  listNotebook(): Promise<Json[]> {
    return this.run((state) => shapeList("NotebookItem", newestFirst(state.notebook, "created_at")), false);
  }

  addNotebookItem(body: unknown): Promise<Json> {
    const payload = valid("NotebookItemCreate", body);
    return this.run((state) => {
      state.seq.notebook += 1;
      const item = {
        id: state.seq.notebook,
        ayah_id: payload.ayah_id,
        mushaf_id: payload.mushaf_id ?? 1,
        surah_id: payload.surah_id ?? null,
        surah: payload.surah ?? null,
        ayah: payload.ayah ?? null,
        text: payload.text ?? null,
        note: payload.note ?? null,
        collection: payload.collection ?? null,
        theme_ids: this.ownedThemeIds(state, payload.theme_ids ?? []),
        created_at: this.clock(),
        dirty: true,
      };
      state.notebook.push(item);
      return shapeModel("NotebookItem", item);
    }, true);
  }

  setNotebookItemThemes(itemId: number, body: unknown): Promise<Json> {
    const payload = valid("NotebookItemThemes", body);
    return this.run((state) => {
      const item = state.notebook.find((row) => row.id === itemId);
      if (!item) throw new HttpError(404, "Notebook item not found.");
      item.theme_ids = this.ownedThemeIds(state, payload.theme_ids);
      item.updated_at = this.clock();
      item.dirty = true;
      return shapeModel("NotebookItem", item);
    }, true);
  }

  deleteNotebookItem(itemId: number): Promise<Json> {
    return this.run((state) => {
      const row = state.notebook.find((item) => item.id === itemId);
      state.notebook = state.notebook.filter((item) => item.id !== itemId);
      const deleted = Boolean(row);
      if (row) this.bury(state, "notebook", itemId, row.remote_id);
      return { deleted };
    }, true);
  }

  // --- themes -------------------------------------------------------------------

  private themeCounts(state: LocalState): Map<number, number> {
    const counts = new Map<number, number>();
    for (const item of state.notebook) {
      for (const id of new Set<unknown>(item.theme_ids ?? [])) if (Number.isInteger(id)) counts.set(id as number, (counts.get(id as number) ?? 0) + 1);
    }
    return counts;
  }

  private themeRow(theme: Json, count: number, withBoard = false): Json {
    const row: Json = {
      id: theme.id,
      name: theme.name,
      color: THEME_COLORS.includes(theme.color) ? theme.color : THEME_COLORS[0],
      description: theme.description,
      item_count: count,
      created_at: theme.created_at,
      updated_at: theme.updated_at,
    };
    if (withBoard) row.board = theme.board ? JSON.parse(theme.board) : null;
    return row;
  }

  listThemes(): Promise<Json[]> {
    return this.run((state) => {
      const counts = this.themeCounts(state);
      const rows = [...state.themes].sort((a, b) => a.created_at - b.created_at || a.id - b.id);
      return shapeList("ThemeSummary", rows.map((theme) => this.themeRow(theme, counts.get(theme.id) ?? 0)));
    }, false);
  }

  private themeDetail(state: LocalState, themeId: number): Json {
    const theme = state.themes.find((row) => row.id === themeId);
    if (!theme) throw new HttpError(404, "Theme not found.");
    return shapeModel("ThemeDetail", this.themeRow(theme, this.themeCounts(state).get(themeId) ?? 0, true));
  }

  getTheme(themeId: number): Promise<Json> {
    return this.run((state) => this.themeDetail(state, themeId), false);
  }

  createTheme(body: unknown): Promise<Json> {
    const payload = valid("ThemeCreate", body);
    return this.run((state) => {
      if (state.themes.length >= MAX_THEMES_PER_USER) throw new HttpError(409, `A user can keep at most ${MAX_THEMES_PER_USER} themes.`);
      const now = this.clock();
      state.seq.themes += 1;
      const theme = {
        id: state.seq.themes,
        name: strip(payload.name),
        color: payload.color || THEME_COLORS[0],
        description: strip(payload.description || "") || null,
        board: null,
        created_at: now,
        updated_at: now,
        dirty: true,
      };
      state.themes.push(theme);
      return shapeModel("ThemeSummary", this.themeRow(theme, 0));
    }, true);
  }

  updateTheme(themeId: number, body: unknown): Promise<Json> {
    const patch = valid("ThemeUpdate", body);
    return this.run((state) => {
      const theme = state.themes.find((row) => row.id === themeId);
      const fields: Json = {};
      for (const key of ["name", "color", "description"]) if (patch[key] !== null && patch[key] !== undefined) fields[key] = patch[key];
      if ("name" in fields) fields.name = strip(fields.name);
      if ("description" in fields) fields.description = strip(fields.description) || null;
      if (theme && Object.keys(fields).length) Object.assign(theme, fields, { updated_at: this.clock(), dirty: true });
      return this.themeDetail(state, themeId);
    }, true);
  }

  saveThemeBoard(themeId: number, body: unknown): Promise<Json> {
    const payload = valid("ThemeBoardSave", body);
    const encoded = pyJsonDumps(payload.board);
    if (utf8Length(encoded) > MAX_THEME_BOARD_BYTES) throw new HttpError(413, `A theme board is limited to ${Math.floor(MAX_THEME_BOARD_BYTES / 1024)} KB.`);
    return this.run((state) => {
      const theme = state.themes.find((row) => row.id === themeId);
      if (!theme) throw new HttpError(404, "Theme not found.");
      theme.board = encoded;
      theme.updated_at = this.clock();
      theme.dirty = true;
      return this.themeDetail(state, themeId);
    }, true);
  }

  deleteTheme(themeId: number): Promise<Json> {
    return this.run((state) => {
      const theme = state.themes.find((row) => row.id === themeId);
      if (!theme) return { deleted: false };
      state.themes = state.themes.filter((row) => row.id !== themeId);
      for (const item of state.notebook) {
        if ((item.theme_ids ?? []).includes(themeId)) {
          item.theme_ids = item.theme_ids.filter((id: number) => id !== themeId);
          item.updated_at = this.clock();
          item.dirty = true;
        }
      }
      this.bury(state, "themes", themeId, theme.remote_id);
      return { deleted: true };
    }, true);
  }

  // --- research sessions --------------------------------------------------------

  listSessions(): Promise<Json[]> {
    return this.run((state) => shapeList("ResearchSessionSummary", newestFirst(state.sessions, "updated_at")), false);
  }

  getSession(sessionId: string): Promise<Json> {
    return this.run((state) => {
      const session = state.sessions.find((row) => row.id === sessionId);
      if (!session) throw new HttpError(404, "Session not found.");
      return shapeModel("ResearchSessionDetail", session);
    }, false);
  }

  saveSession(body: unknown): Promise<Json> {
    const payload = valid("ResearchSessionSave", body);
    if (utf8Length(pyJsonDumps(payload.messages)) > MAX_SESSION_MESSAGES_BYTES) {
      throw new HttpError(422, [{ type: "value_error", loc: ["body", "messages"], msg: `Value error, Session messages exceed the ${Math.floor(MAX_SESSION_MESSAGES_BYTES / 1024)} KB limit.` }]);
    }
    return this.run((state) => {
      const now = this.clock();
      const existing = state.sessions.find((row) => row.id === payload.id);
      const messages = payload.messages ?? [];
      const session = {
        id: payload.id,
        title: payload.title ?? "جلسة بحث",
        mode: payload.mode ?? "strict",
        message_count: messages.length,
        messages,
        created_at: existing ? existing.created_at : now,
        updated_at: now,
        dirty: true,
        ...(existing?.remote_id !== undefined ? { remote_id: existing.remote_id } : {}),
      };
      // INSERT OR REPLACE: the saved session becomes the newest row.
      state.sessions = state.sessions.filter((row) => row.id !== payload.id);
      state.sessions.push(session);
      return shapeModel("ResearchSessionDetail", session);
    }, true);
  }

  deleteSession(sessionId: string): Promise<Json> {
    return this.run((state) => {
      const row = state.sessions.find((item) => item.id === sessionId);
      state.sessions = state.sessions.filter((item) => item.id !== sessionId);
      const deleted = Boolean(row);
      if (row) this.bury(state, "sessions", sessionId, row.remote_id);
      return { deleted };
    }, true);
  }

  // --- followed roots -------------------------------------------------------------

  listRoots(): Promise<Json[]> {
    return this.run((state) => shapeList("FollowedRoot", newestFirst(state.roots, "created_at")), false);
  }

  followRoot(body: unknown): Promise<Json> {
    const payload = valid("FollowedRootCreate", body);
    return this.run((state) => {
      const rootText = strip(payload.root_text || "");
      const existing = state.roots.find((row) => row.root_text === rootText);
      if (existing) return shapeModel("FollowedRoot", existing);
      state.seq.roots += 1;
      const root = { id: state.seq.roots, root_text: rootText, root_id: payload.root_id ?? null, occurrences: payload.occurrences ?? null, created_at: this.clock(), dirty: true };
      state.roots.push(root);
      return shapeModel("FollowedRoot", root);
    }, true);
  }

  unfollowRoot(rootId: number): Promise<Json> {
    return this.run((state) => {
      const row = state.roots.find((item) => item.id === rootId);
      state.roots = state.roots.filter((item) => item.id !== rootId);
      const deleted = Boolean(row);
      if (row) this.bury(state, "roots", rootId, row.remote_id);
      return { deleted };
    }, true);
  }

  // --- research documents ---------------------------------------------------------

  private async verifyQuotes(payload: Json): Promise<Json> {
    const issues: Json[] = [];
    let checked = 0;
    for (const section of payload.sections ?? []) {
      for (const ref of section.ayahs ?? []) {
        checked += 1;
        const verse = await this.options.quran.getAyahVerse(ref.mushaf_id, ref.surah_id, ref.ayah);
        if (verse === null) {
          issues.push({ section_id: section.id, surah_id: ref.surah_id, ayah: ref.ayah, problem: "not_found" });
          continue;
        }
        ref.ayah_id = verse.ayah_id;
        const quoted = strip(ref.text || "");
        if (!quoted) ref.text = verse.text;
        else if (normalizeCountText(quoted) !== normalizeCountText(verse.text)) {
          issues.push({ section_id: section.id, surah_id: ref.surah_id, ayah: ref.ayah, problem: "text_mismatch", expected: verse.text });
        }
      }
    }
    return { ok: !issues.length, checked, issues };
  }

  private static documentBody(body: unknown): Json {
    const payload = valid("ResearchDocumentSave", body);
    // The model's validators: tags cleaned and de-duplicated, section ids unique.
    payload.tags = [...new Set((payload.tags as string[]).filter((tag) => tag && strip(tag)).map((tag) => Array.from(strip(tag)).slice(0, 40).join("")))];
    const ids = (payload.sections as Json[]).map((section) => section.id);
    if (new Set(ids).size !== ids.length) {
      throw new HttpError(422, [{ type: "value_error", loc: ["body", "sections"], msg: "Value error, Section ids must be unique." }]);
    }
    return payload;
  }

  private static encodeDocument(payload: Json): string {
    const encoded = pyJsonDumps(payload);
    if (utf8Length(encoded) > MAX_DOCUMENT_BYTES) throw new HttpError(413, `A research document is limited to ${Math.floor(MAX_DOCUMENT_BYTES / 1024)} KB.`);
    return encoded;
  }

  private static document(row: Json): Json {
    return { ...JSON.parse(row.body), id: row.id, v: RESEARCH_DOCUMENT_VERSION, version: row.version, created_at: row.created_at, updated_at: row.updated_at };
  }

  private static summary(row: Json): Json {
    const body = JSON.parse(row.body);
    const provenance = body.provenance || {};
    const sections: Json[] = body.sections ?? [];
    return {
      id: row.id,
      title: row.title,
      summary: body.summary ?? null,
      mode: provenance.mode ?? null,
      created_from: provenance.created_from ?? "manual",
      section_count: sections.length,
      ayah_count: sections.reduce((total, section) => total + (section.ayahs ?? []).length, 0),
      visibility: body.visibility ?? "private",
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  listDocuments(): Promise<Json[]> {
    return this.run((state) => shapeList("ResearchDocumentSummary", newestFirst(state.documents, "updated_at").map(LocalStore.summary)), false);
  }

  getDocument(documentId: string): Promise<Json> {
    return this.run((state) => {
      const row = state.documents.find((item) => item.id === documentId);
      if (!row) throw new HttpError(404, "Research document not found.");
      return shapeModel("ResearchDocument", LocalStore.document(row), true);
    }, false);
  }

  async createDocument(body: unknown): Promise<Json> {
    const payload = LocalStore.documentBody(body);
    const verification = await this.verifyQuotes(payload);
    const encoded = LocalStore.encodeDocument(payload);
    return this.run((state) => {
      if (state.documents.length >= MAX_DOCUMENTS_PER_USER) throw new HttpError(413, `A user can keep at most ${MAX_DOCUMENTS_PER_USER} research documents.`);
      const now = this.clock();
      const row = { id: `doc-${tokenUrlsafe(10)}`, title: payload.title, body: encoded, version: 1, created_at: now, updated_at: now, dirty: true };
      state.documents.push(row);
      return shapeModel("ResearchDocument", { ...LocalStore.document(row), verification }, true);
    }, true);
  }

  async replaceDocument(documentId: string, body: unknown): Promise<Json> {
    const payload = LocalStore.documentBody(body);
    const verification = await this.verifyQuotes(payload);
    const encoded = LocalStore.encodeDocument(payload);
    return this.run((state) => {
      const row = state.documents.find((item) => item.id === documentId);
      if (!row) throw new HttpError(404, "Research document not found.");
      Object.assign(row, { title: payload.title, body: encoded, version: row.version + 1, updated_at: this.clock(), dirty: true });
      return shapeModel("ResearchDocument", { ...LocalStore.document(row), verification }, true);
    }, true);
  }

  deleteDocument(documentId: string): Promise<Json> {
    return this.run((state) => {
      const row = state.documents.find((item) => item.id === documentId);
      state.documents = state.documents.filter((item) => item.id !== documentId);
      const deleted = Boolean(row);
      if (row) this.bury(state, "documents", documentId, row.remote_id);
      return { deleted };
    }, true);
  }

  async auditDocument(documentId: string): Promise<Json> {
    const document = await this.getDocument(documentId);
    const sections: Json[] = (document.sections as Json[]) ?? [];
    const provenance: Json = (document.provenance as Json) || {};
    const checks: Json[] = [];
    const verification = await this.verifyQuotes(structuredClone(document));
    checks.push({
      rule: "quotes_verified",
      passed: verification.ok,
      detail: verification.ok ? null : verification.issues.map((issue: Json) => `${issue.surah_id}:${issue.ayah}`).join("، "),
    });
    const hasContent = Boolean(strip((document.title as string) ?? "")) && sections.some((section) => strip(section.body ?? "") || (section.ayahs ?? []).length);
    checks.push({ rule: "has_content", passed: hasContent, detail: null });
    const aiKind = new Set(sections.filter((section) => section.kind === "ai_answer").map((section) => section.id));
    const aiListed = new Set<string>(provenance.ai_sections || []);
    const aiOk = aiKind.size === aiListed.size && [...aiKind].every((id) => aiListed.has(id));
    checks.push({ rule: "ai_sections_labelled", passed: aiOk, detail: aiOk ? null : "كل قسم مولَّد آلياً يجب أن يُوسَم بذلك (والعكس)." });
    if (provenance.mode === "tafssir") {
      const texts = [(document.summary as string) || "", ...sections.map((section) => section.body ?? "")];
      const hasDisclaimer = texts.some((text) => text.includes("تجريبي"));
      checks.push({ rule: "tafssir_disclaimer", passed: hasDisclaimer, detail: hasDisclaimer ? null : "القراءة التفسيرية تجريبية ويجب أن تحمل التنبيه." });
    }
    const mushafId = sections.flatMap((section) => section.ayahs ?? []).map((ref: Json) => ref.mushaf_id)[0] ?? 2;
    const badRefs: string[] = [];
    for (const reference of (document.references as Json[]) ?? []) {
      if (reference.kind !== "ayah") continue;
      const parts = String(reference.locator ?? "").split(":");
      const numbers = parts.map((part) => (/^\s*[+-]?\d+\s*$/.test(part) ? Number(part) : NaN));
      if (numbers.length !== 2 || numbers.some(Number.isNaN)) {
        badRefs.push(reference.label ?? "");
        continue;
      }
      if ((await this.options.quran.getAyahVerse(mushafId, numbers[0], numbers[1])) === null) badRefs.push(reference.label ?? "");
    }
    checks.push({ rule: "ayah_references_resolve", passed: !badRefs.length, detail: badRefs.length ? badRefs.join("، ") : null });
    return shapeModel("DocumentAudit", { publishable: checks.every((check) => check.passed), checks });
  }
}

function valid(model: string, body: unknown): Json {
  const { value, issues } = validateModel(model, body);
  if (issues.length) throw new HttpError(422, issues satisfies Issue[]);
  return value;
}

// --- routes --------------------------------------------------------------------------

type Route = { method: string; pattern: RegExp; handle: (store: LocalStore, params: string[], body: unknown) => Promise<unknown> };

const intParam = (value: string): number => {
  if (!/^[+-]?\d+$/.test(value)) throw new HttpError(422, [{ type: "int_parsing", loc: ["path"], msg: "Input should be a valid integer" }]);
  return Number(value);
};

const ROUTES: Route[] = [
  { method: "GET", pattern: /^\/api\/notebook$/, handle: (store) => store.listNotebook() },
  { method: "POST", pattern: /^\/api\/notebook$/, handle: (store, _p, body) => store.addNotebookItem(body) },
  { method: "DELETE", pattern: /^\/api\/notebook\/([^/]+)$/, handle: (store, [id]) => store.deleteNotebookItem(intParam(id)) },
  { method: "PUT", pattern: /^\/api\/notebook\/([^/]+)\/themes$/, handle: (store, [id], body) => store.setNotebookItemThemes(intParam(id), body) },
  { method: "GET", pattern: /^\/api\/themes$/, handle: (store) => store.listThemes() },
  { method: "POST", pattern: /^\/api\/themes$/, handle: (store, _p, body) => store.createTheme(body) },
  { method: "GET", pattern: /^\/api\/themes\/([^/]+)$/, handle: (store, [id]) => store.getTheme(intParam(id)) },
  { method: "PATCH", pattern: /^\/api\/themes\/([^/]+)$/, handle: (store, [id], body) => store.updateTheme(intParam(id), body) },
  { method: "PUT", pattern: /^\/api\/themes\/([^/]+)\/board$/, handle: (store, [id], body) => store.saveThemeBoard(intParam(id), body) },
  { method: "DELETE", pattern: /^\/api\/themes\/([^/]+)$/, handle: (store, [id]) => store.deleteTheme(intParam(id)) },
  { method: "GET", pattern: /^\/api\/documents$/, handle: (store) => store.listDocuments() },
  { method: "POST", pattern: /^\/api\/documents$/, handle: (store, _p, body) => store.createDocument(body) },
  { method: "GET", pattern: /^\/api\/documents\/([^/]+)$/, handle: (store, [id]) => store.getDocument(id) },
  { method: "PUT", pattern: /^\/api\/documents\/([^/]+)$/, handle: (store, [id], body) => store.replaceDocument(id, body) },
  { method: "GET", pattern: /^\/api\/documents\/([^/]+)\/audit$/, handle: (store, [id]) => store.auditDocument(id) },
  { method: "DELETE", pattern: /^\/api\/documents\/([^/]+)$/, handle: (store, [id]) => store.deleteDocument(id) },
  { method: "GET", pattern: /^\/api\/sessions$/, handle: (store) => store.listSessions() },
  { method: "GET", pattern: /^\/api\/sessions\/([^/]+)$/, handle: (store, [id]) => store.getSession(id) },
  { method: "POST", pattern: /^\/api\/sessions$/, handle: (store, _p, body) => store.saveSession(body) },
  { method: "DELETE", pattern: /^\/api\/sessions\/([^/]+)$/, handle: (store, [id]) => store.deleteSession(id) },
  { method: "GET", pattern: /^\/api\/roots$/, handle: (store) => store.listRoots() },
  { method: "POST", pattern: /^\/api\/roots$/, handle: (store, _p, body) => store.followRoot(body) },
  { method: "DELETE", pattern: /^\/api\/roots\/([^/]+)$/, handle: (store, [id]) => store.unfollowRoot(intParam(id)) },
  { method: "GET", pattern: /^\/api\/user\/preferences$/, handle: (store) => store.getPreferences() },
  { method: "PATCH", pattern: /^\/api\/user\/preferences$/, handle: (store, _p, body) => store.updatePreferences(body) },
];

/** Answer a companion route from the local store, or null when the path is not one. */
export async function handleLocal(store: LocalStore, method: string, pathname: string, body: unknown): Promise<{ status: number; body: unknown } | null> {
  const path = pathname.replace(/\/+$/, "");
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    try {
      return { status: 200, body: await route.handle(store, match.slice(1).map(decodeURIComponent), body) };
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: { detail: error.detail } };
      throw error;
    }
  }
  return null;
}

export function isLocalRoute(method: string, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return ROUTES.some((route) => route.method === method && route.pattern.test(path));
}

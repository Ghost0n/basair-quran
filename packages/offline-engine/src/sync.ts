/**
 * Account sync for the device's local data (notebook, themes and boards,
 * research sessions, followed roots, research documents, preferences).
 *
 * The device stays the source of what the reader sees (offline-first); when
 * online and signed in, `syncAccount` reconciles it with the account through
 * the account's ordinary routes (companions.py):
 *
 * 1. **Push** what changed here since the last sync: deletions (rows the
 *    account also has), new rows (the account's ids are recorded as
 *    `remote_id`), and edits (`dirty` rows). Theme references are translated
 *    to the account's theme ids.
 * 2. **Pull** the account's state and make the device match it: new rows from
 *    other devices arrive, rows deleted elsewhere go, edits land (theme
 *    references translated back to local ids).
 *
 * Conflicts resolve as "the last device to sync wins" per row. A different
 * account signing in never sees the previous account's synced rows; rows
 * made on the device before any sign-in are uploaded to the account that
 * signs in (like the web's guest → account merge).
 */
import type { CollectionName, LocalState, LocalStore } from "./local-store";
import { pyJsonDumps } from "./local-store";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** One request to the account's API (JSON in, status and JSON out). */
export type Remote = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class SyncError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export type SyncReport = { pushed: number; deleted: number; pulled: Record<CollectionName | "preferences", number> };

const DELETE_PATH: Record<CollectionName, string> = {
  notebook: "/api/notebook/",
  themes: "/api/themes/",
  sessions: "/api/sessions/",
  roots: "/api/roots/",
  documents: "/api/documents/",
};

/** The document body the account stores (everything but its identity and bookkeeping). */
function documentBody(detail: Json): Json {
  const { id: _id, v: _v, version: _version, created_at: _created, updated_at: _updated, verification: _verification, ...body } = detail;
  return body;
}

export async function syncAccount(store: LocalStore, remote: Remote, accountId: number, now: () => number = () => Math.floor(Date.now() / 1000)): Promise<SyncReport> {
  const call = async (method: string, path: string, body?: unknown, allow404 = false) => {
    const response = await remote(method, path, body);
    if (response.status === 404 && allow404) return null;
    if (response.status < 200 || response.status >= 300) throw new SyncError(response.status, `${method} ${path} → ${response.status}`);
    return response.body;
  };

  return store.exclusive(async (state) => {
    const report: SyncReport = { pushed: 0, deleted: 0, pulled: { notebook: 0, themes: 0, sessions: 0, roots: 0, documents: 0, preferences: 0 } };
    switchAccount(state, accountId);

    // --- push: deletions -------------------------------------------------------
    for (const tombstone of [...state.tombstones]) {
      if (tombstone.remote_id !== undefined) {
        await call("DELETE", `${DELETE_PATH[tombstone.kind]}${encodeURIComponent(String(tombstone.remote_id))}`, undefined, true);
        report.deleted += 1;
      }
      state.tombstones = state.tombstones.filter((entry) => entry !== tombstone);
    }

    // --- push: themes first (saved ayahs refer to them) --------------------------
    for (const theme of state.themes) {
      if (theme.remote_id === undefined) {
        const created = await call("POST", "/api/themes", { name: theme.name, color: theme.color, description: theme.description });
        theme.remote_id = created.id;
        theme.dirty = true;
      }
      if (theme.dirty) {
        await call("PATCH", `/api/themes/${theme.remote_id}`, { name: theme.name, color: theme.color, description: theme.description ?? "" });
        if (theme.board) await call("PUT", `/api/themes/${theme.remote_id}/board`, { board: JSON.parse(theme.board) });
        theme.dirty = false;
        report.pushed += 1;
      }
    }
    const toRemoteTheme = new Map(state.themes.map((theme) => [theme.id as number, theme.remote_id as number]));
    const remoteThemes = (ids: number[] = []) => ids.map((id) => toRemoteTheme.get(id)).filter((id): id is number => id !== undefined);

    for (const item of state.notebook) {
      if (item.remote_id === undefined) {
        const created = await call("POST", "/api/notebook", {
          ayah_id: item.ayah_id,
          mushaf_id: item.mushaf_id,
          surah_id: item.surah_id,
          surah: item.surah,
          ayah: item.ayah,
          text: item.text,
          note: item.note,
          collection: item.collection,
          theme_ids: remoteThemes(item.theme_ids),
        });
        item.remote_id = created.id;
        report.pushed += 1;
      } else if (item.dirty) {
        await call("PUT", `/api/notebook/${item.remote_id}/themes`, { theme_ids: remoteThemes(item.theme_ids) });
        report.pushed += 1;
      }
      item.dirty = false;
    }

    for (const session of state.sessions) {
      if (session.remote_id === undefined || session.dirty) {
        await call("POST", "/api/sessions", { id: session.id, title: session.title, mode: session.mode, messages: session.messages ?? [] });
        session.remote_id = session.id;
        session.dirty = false;
        report.pushed += 1;
      }
    }

    for (const root of state.roots) {
      if (root.remote_id === undefined) {
        const created = await call("POST", "/api/roots", { root_text: root.root_text, root_id: root.root_id, occurrences: root.occurrences });
        root.remote_id = created.id;
        report.pushed += 1;
      }
      root.dirty = false;
    }

    for (const document of state.documents) {
      if (document.remote_id === undefined) {
        const created = await call("POST", "/api/documents", JSON.parse(document.body));
        document.remote_id = created.id;
        report.pushed += 1;
      } else if (document.dirty) {
        await call("PUT", `/api/documents/${encodeURIComponent(document.remote_id)}`, JSON.parse(document.body));
        report.pushed += 1;
      }
      document.dirty = false;
    }

    if (state.preferences?.dirty) {
      await call("PATCH", "/api/user/preferences", state.preferences.data);
      state.preferences.dirty = false;
      report.pushed += 1;
    }

    // --- pull ----------------------------------------------------------------------
    const byRemote = <T extends Json>(rows: T[]) => new Map(rows.filter((row) => row.remote_id !== undefined).map((row) => [String(row.remote_id), row]));

    const themes = byRemote(state.themes);
    const pulledThemes: Json[] = [];
    for (const summary of (await call("GET", "/api/themes")) as Json[]) {
      const local = themes.get(String(summary.id));
      const detail = local && local.updated_at === summary.updated_at ? null : await call("GET", `/api/themes/${summary.id}`);
      const id = local ? local.id : (state.seq.themes += 1);
      pulledThemes.push({
        ...(local ?? {}),
        id,
        remote_id: summary.id,
        name: summary.name,
        color: summary.color,
        description: summary.description ?? null,
        board: detail ? (detail.board ? pyJsonDumps(detail.board) : null) : (local?.board ?? null),
        created_at: summary.created_at,
        updated_at: summary.updated_at,
        dirty: false,
      });
      if (!local || detail) report.pulled.themes += 1;
    }
    state.themes = pulledThemes;
    const toLocalTheme = new Map(state.themes.map((theme) => [theme.remote_id as number, theme.id as number]));

    const notebook = byRemote(state.notebook);
    state.notebook = ((await call("GET", "/api/notebook")) as Json[])
      .map((item) => {
        const local = notebook.get(String(item.id));
        if (!local) report.pulled.notebook += 1;
        const { id: remoteId, ...fields } = item;
        return {
          ...fields,
          id: local ? local.id : (state.seq.notebook += 1),
          remote_id: remoteId,
          theme_ids: (item.theme_ids as number[]).map((id) => toLocalTheme.get(id)).filter((id): id is number => id !== undefined),
          dirty: false,
        };
      })
      .reverse(); // the account lists newest first; the store keeps insertion order

    const sessions = byRemote(state.sessions);
    const pulledSessions: Json[] = [];
    for (const summary of ((await call("GET", "/api/sessions")) as Json[]).reverse()) {
      const local = sessions.get(String(summary.id));
      const fresh = !local || local.updated_at !== summary.updated_at;
      const detail = fresh ? await call("GET", `/api/sessions/${encodeURIComponent(summary.id)}`) : null;
      pulledSessions.push(detail ? { ...detail, remote_id: summary.id, dirty: false } : { ...local!, dirty: false });
      if (fresh) report.pulled.sessions += 1;
    }
    state.sessions = pulledSessions;

    const roots = byRemote(state.roots);
    state.roots = ((await call("GET", "/api/roots")) as Json[])
      .map((root) => {
        const local = roots.get(String(root.id));
        if (!local) report.pulled.roots += 1;
        return { ...root, id: local ? local.id : (state.seq.roots += 1), remote_id: root.id, dirty: false };
      })
      .reverse();

    const documents = byRemote(state.documents);
    const pulledDocuments: Json[] = [];
    for (const summary of ((await call("GET", "/api/documents")) as Json[]).reverse()) {
      const local = documents.get(String(summary.id));
      if (local && local.version === summary.version && local.updated_at === summary.updated_at) {
        pulledDocuments.push({ ...local, dirty: false });
        continue;
      }
      const detail = await call("GET", `/api/documents/${encodeURIComponent(summary.id)}`);
      pulledDocuments.push({
        id: local ? local.id : summary.id,
        remote_id: summary.id,
        title: detail.title,
        body: pyJsonDumps(documentBody(detail)),
        version: detail.version,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
        dirty: false,
      });
      report.pulled.documents += 1;
    }
    state.documents = pulledDocuments;

    const preferences = await call("GET", "/api/user/preferences");
    state.preferences = { data: preferences, updated_at: now(), dirty: false };
    report.pulled.preferences = 1;

    state.last_sync = now();
    return report;
  });
}

/**
 * The device's data follows whoever is signed in: another account's synced
 * rows are dropped (they stay in that account), rows never synced are kept and
 * will go to the new account.
 */
function switchAccount(state: LocalState, accountId: number): void {
  if (state.account === accountId) return;
  if (state.account !== undefined && state.account !== null) forgetSynced(state);
  state.account = accountId;
}

/** Drop everything the device holds from an account (sign-out, or another account signing in). */
export function forgetSynced(state: LocalState): void {
  const local = <T extends Json>(rows: T[]) => rows.filter((row) => row.remote_id === undefined);
  state.notebook = local(state.notebook);
  state.themes = local(state.themes);
  state.sessions = local(state.sessions);
  state.roots = local(state.roots);
  state.documents = local(state.documents);
  state.tombstones = state.tombstones.filter((tombstone) => tombstone.remote_id === undefined);
  const kept = new Set(state.themes.map((theme) => theme.id));
  for (const item of state.notebook) item.theme_ids = (item.theme_ids ?? []).filter((id: number) => kept.has(id));
  state.preferences = null;
  state.account = null;
  state.last_sync = null;
}

/** Sign-out: the account's data leaves the device; what was made here while signed out stays. */
export function forgetAccount(store: LocalStore): Promise<void> {
  return store.exclusive(async (state) => forgetSynced(state));
}

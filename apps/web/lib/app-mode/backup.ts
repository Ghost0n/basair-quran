/**
 * Backups of a guest's data in the standalone app (Settings → «النسخ
 * الاحتياطي»): without an account, the notebook, themes and boards, study
 * sessions, roots, documents and preferences live on this device only. A
 * backup is all of it in one file (`basair-….json`), handed to the phone's
 * share sheet — «Save to Files» → iCloud Drive on iPhone, Google Drive (the
 * Drive app) on both — and restored from the file picker, which opens on
 * iCloud Drive or Google Drive too.
 *
 * The file is the device's own data store (packages/offline-engine
 * LocalStore) as it is, so nothing is lost or reshaped; a restore replaces
 * it, after keeping what was there under a safety key. AI keys and other
 * device settings are not part of it.
 */
import type { LocalState } from "@q-basair/offline-engine";

import { nativeShareFiles } from "@/lib/native-share";

import { appRuntime } from "./runtime";

export const BACKUP_FORMAT = "basair-backup";
const BEFORE_RESTORE_KEY = "qb.userdata.before-restore";
export const RESTORED_EVENT = "qb:data-synced";

export type BackupCounts = { notebook: number; themes: number; sessions: number; roots: number; documents: number };

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: 1;
  created_at: string;
  counts: BackupCounts;
  data: LocalState;
};

export class BackupError extends Error {}

export function countsOf(state: LocalState): BackupCounts {
  return {
    notebook: state.notebook.length,
    themes: state.themes.length,
    sessions: state.sessions.length,
    roots: state.roots.length,
    documents: state.documents.length,
  };
}

/** A backup of `state`, ready to save. */
export function makeBackup(state: LocalState, now: Date = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: 1, created_at: now.toISOString(), counts: countsOf(state), data: state };
}

export function backupFileName(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `basair-${day}.json`;
}

/** A backup file read back; refuses anything that isn't one (or is from a newer app). */
export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError("not-json");
  }
  const backup = parsed as Partial<Backup> | null;
  if (!backup || backup.format !== BACKUP_FORMAT || !backup.data) throw new BackupError("not-a-backup");
  if (backup.version !== 1 || backup.data.format !== 1) throw new BackupError("newer-version");
  for (const list of ["notebook", "themes", "sessions", "roots", "documents"] as const) {
    if (!Array.isArray(backup.data[list])) throw new BackupError("not-a-backup");
  }
  return { ...(backup as Backup), counts: countsOf(backup.data) };
}

async function store() {
  const { api, platform } = await appRuntime();
  if (!api.store) throw new BackupError("no-store");
  return { store: api.store, platform };
}

/** What a backup made now would hold. */
export async function currentCounts(): Promise<BackupCounts> {
  const { store: local } = await store();
  return countsOf(await local.snapshot());
}

/**
 * Save a backup through the phone's share sheet (iCloud Drive, Google
 * Drive…); in a browser preview it downloads. "cancelled" when the reader
 * closed the sheet.
 */
export async function saveBackup(text: string): Promise<"saved" | "cancelled"> {
  const { store: local } = await store();
  const backup = makeBackup(await local.snapshot());
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const name = backupFileName();
  const shared = await nativeShareFiles([{ blob, name }], text);
  if (shared === "cancelled") return "cancelled";
  if (shared === null) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  }
  return "saved";
}

/**
 * Replace this device's data with a backup's. What was here is kept first
 * (under a safety key), and the device's own account link stays as it is.
 */
export async function restoreBackup(backup: Backup): Promise<void> {
  const { store: local, platform } = await store();
  const before = await local.snapshot();
  await platform.kv.set(BEFORE_RESTORE_KEY, JSON.stringify(makeBackup(before)));
  await local.replace({ ...backup.data, account: before.account ?? null, last_sync: before.last_sync ?? null });
  window.dispatchEvent(new CustomEvent(RESTORED_EVENT, { detail: { restored: backup.counts } }));
}

/**
 * Downloadable packs (docs/offline-packs.md): the catalogue from the server's
 * manifest, and installing / updating / removing packs on the device. A pack
 * is verified (SHA-256) before anything is written; a narration or translation
 * is copied into the device database in one transaction, so an interrupted
 * install leaves nothing half-done.
 */
import type { OfflineApi } from "@q-basair/offline-engine";

import { PACKS_URL } from "./config";
import type { DeviceDatabase, DevicePlatform } from "./platform";

export type PackKind = "core" | "narration" | "translation" | "interface" | "reciter";

export type PackEntry = {
  id: string;
  kind: PackKind;
  file?: string;
  size?: number;
  sha256?: string;
  version?: string;
  name?: string;
  description?: string;
  mushaf_id?: number;
  key?: string;
  language?: string;
  translator?: string;
  source?: string;
  source_url?: string;
  native?: string;
  dir?: string;
  reciter?: string;
  name_english?: string;
  riwayah?: string;
  audio_base?: string;
};

export type LanguageEntry = { code: string; native: string | null; dir: string | null; interface: string | null; translation: string | null };

export type Manifest = { format: number; generated_at: string; core: PackEntry; packs: PackEntry[]; languages: LanguageEntry[] };

export type InstalledPack = { id: string; kind: PackKind; version: string; size: number; installed_at: number; mushaf_id?: number; key?: string; language?: string };

export type Progress = { pack: string; received: number; total: number };

const MANIFEST_KEY = "qb.packs.manifest";
const INSTALLED_KEY = "qb.packs.installed";
export const interfaceKey = (code: string) => `qb.interface.${code}`;

export class PackError extends Error {}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function download(url: string, expected: number | undefined, onProgress?: (received: number, total: number) => void): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new PackError(`download failed (${response.status})`);
  const total = expected ?? Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export class PackManager {
  private manifest: Manifest | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly platform: DevicePlatform,
    private readonly quranDb: DeviceDatabase,
    private readonly translationsDb: DeviceDatabase,
    private readonly api: OfflineApi,
  ) {}

  /** Re-render subscribers after an install or removal. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    this.listeners.forEach((listener) => listener());
  }

  /** The catalogue: fresh from the server when online, else the last one seen. */
  async catalogue(refresh = false): Promise<Manifest | null> {
    if (this.manifest && !refresh) return this.manifest;
    try {
      const response = await fetch(`${PACKS_URL}/manifest.json`, { cache: "no-store" });
      if (!response.ok) throw new PackError(String(response.status));
      this.manifest = (await response.json()) as Manifest;
      await this.platform.kv.set(MANIFEST_KEY, JSON.stringify(this.manifest));
    } catch {
      const cached = await this.platform.kv.get(MANIFEST_KEY);
      this.manifest = cached ? (JSON.parse(cached) as Manifest) : null;
    }
    return this.manifest;
  }

  async installed(): Promise<Record<string, InstalledPack>> {
    const raw = await this.platform.kv.get(INSTALLED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, InstalledPack>) : {};
  }

  private async setInstalled(next: Record<string, InstalledPack>) {
    await this.platform.kv.set(INSTALLED_KEY, JSON.stringify(next));
  }

  /** Installed packs whose catalogue version changed (a corrected text, a new translation revision). */
  async updates(): Promise<PackEntry[]> {
    const [manifest, installed] = await Promise.all([this.catalogue(), this.installed()]);
    if (!manifest) return [];
    return manifest.packs.filter((pack) => installed[pack.id] && pack.version && installed[pack.id].version !== pack.version);
  }

  async install(pack: PackEntry, onProgress?: (progress: Progress) => void): Promise<void> {
    if (!pack.file || !pack.sha256) throw new PackError(`${pack.id} has nothing to download`);
    const bytes = await download(`${PACKS_URL}/${pack.file}`, pack.size, (received, total) => onProgress?.({ pack: pack.id, received, total }));
    if ((await sha256Hex(bytes)) !== pack.sha256) throw new PackError(`${pack.id}: checksum mismatch`);
    const installed = await this.installed();
    if (installed[pack.id]) await this.removeData(installed[pack.id]);
    if (pack.kind === "narration") await this.quranDb.importPack(bytes, pack.id);
    else if (pack.kind === "translation") await this.translationsDb.importPack(bytes, pack.id);
    else if (pack.kind === "interface") await this.platform.kv.set(interfaceKey(pack.language!), new TextDecoder().decode(bytes));
    else throw new PackError(`${pack.kind} packs are not installed this way`);
    installed[pack.id] = {
      id: pack.id,
      kind: pack.kind,
      version: pack.version ?? "",
      size: bytes.length,
      installed_at: Math.floor(Date.now() / 1000),
      mushaf_id: pack.mushaf_id,
      key: pack.key,
      language: pack.language,
    };
    await this.setInstalled(installed);
    this.api.reset(this.translationsDb);
    this.changed();
  }

  private async removeData(pack: InstalledPack): Promise<void> {
    if (pack.kind === "narration" && pack.mushaf_id !== undefined) {
      const layout = (await this.quranDb.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'mushaf_layout_%'")).map((row) => String(row.name));
      await this.quranDb.removePack(pack.id, [
        { sql: "DELETE FROM word_occurrences WHERE ayah_id IN (SELECT id FROM ayahs WHERE mushaf_id = ?)", params: [pack.mushaf_id] },
        { sql: "DELETE FROM ayah_words WHERE mushaf_id = ?", params: [pack.mushaf_id] },
        ...layout.map((table) => ({ sql: `DELETE FROM ${table} WHERE mushaf_id = ?`, params: [pack.mushaf_id!] })),
        { sql: "DELETE FROM ayahs WHERE mushaf_id = ?", params: [pack.mushaf_id] },
      ]);
    } else if (pack.kind === "translation" && pack.key) {
      await this.translationsDb.removePack(pack.id, [
        { sql: "DELETE FROM translation_ayahs WHERE key = ?", params: [pack.key] },
        { sql: "DELETE FROM translations WHERE key = ?", params: [pack.key] },
      ]);
    } else if (pack.kind === "interface" && pack.language) {
      await this.platform.kv.remove(interfaceKey(pack.language));
    }
  }

  async remove(id: string): Promise<void> {
    const installed = await this.installed();
    const pack = installed[id];
    if (!pack) return;
    await this.removeData(pack);
    delete installed[id];
    await this.setInstalled(installed);
    this.api.reset(this.translationsDb);
    this.changed();
  }

  /**
   * One language choice (onboarding, Settings): its interface dictionary and
   * its recommended translation of meanings. Returns the translation key, if any.
   */
  async installLanguage(code: string, onProgress?: (progress: Progress) => void): Promise<string | null> {
    const manifest = await this.catalogue();
    if (!manifest) throw new PackError("the catalogue is unavailable offline");
    const language = manifest.languages.find((entry) => entry.code === code);
    if (!language) throw new PackError(`unknown language ${code}`);
    const installed = await this.installed();
    let translationKey: string | null = null;
    for (const id of [language.interface, language.translation]) {
      if (!id) continue;
      const pack = manifest.packs.find((entry) => entry.id === id);
      if (!pack) continue;
      if (installed[id]?.version !== pack.version) await this.install(pack, onProgress);
      if (pack.kind === "translation") translationKey = pack.key ?? null;
    }
    return translationKey;
  }
}

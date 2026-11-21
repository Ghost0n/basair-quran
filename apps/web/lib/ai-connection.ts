/**
 * The reader's AI connection (Settings → «الذكاء الاصطناعي», docs/ai-connections.md):
 * which provider the study uses — the server's own when none is chosen — and,
 * per provider, the reader's key and chosen model. A guest's stays on this
 * device; a signed-in reader's is kept on their account too (encrypted,
 * `/user/ai-connection`), so it is on every device they sign in to and leaves
 * this browser at sign-out (`syncAiConnectionWithAccount`). A key can be
 * forgotten from Settings.
 */
import type { AiConnectionState, AiConnectionUpdate, AiProviderId, ThinkingLevel } from "@q-basair/shared";

export type AiConnection = {
  /** null: the server's own model. */
  provider: AiProviderId | null;
  keys: Partial<Record<AiProviderId, string>>;
  models: Partial<Record<AiProviderId, string>>;
  /** Former per-provider thinking levels: still read, no longer picked nor sent (each model's default). */
  thinking: Partial<Record<AiProviderId, ThinkingLevel>>;
};

export const AI_CONNECTION_KEY = "qb.ai.connection";
/** Whose connection this browser holds (an account id, or null: the guest's own) and whether a change awaits the account. */
export const AI_CONNECTION_OWNER_KEY = "qb.ai.connection.owner";
// The study page's former settings (an Ollama key and model, this tab only).
const LEGACY_KEY = "qbasair.research.ollama";

const EMPTY: AiConnection = { provider: null, keys: {}, models: {}, thinking: {} };

let cached: AiConnection | null = null;
const listeners = new Set<() => void>();

function read(): AiConnection {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(AI_CONNECTION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiConnection>;
      return { provider: parsed.provider ?? null, keys: parsed.keys ?? {}, models: parsed.models ?? {}, thinking: parsed.thinking ?? {} };
    }
    // Carried over once from the study page's former Ollama settings.
    const legacy = window.sessionStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as { apiKey?: string; chatModel?: string };
      if (old.apiKey?.trim()) {
        return { provider: "ollama", keys: { ollama: old.apiKey.trim() }, models: old.chatModel?.trim() ? { ollama: old.chatModel.trim() } : {}, thinking: {} };
      }
    }
  } catch {
    /* storage unavailable or damaged: the server's own model */
  }
  return EMPTY;
}

export function aiConnection(): AiConnection {
  if (!cached) cached = read();
  return cached;
}

function store(next: AiConnection): void {
  cached = next;
  try {
    window.localStorage.setItem(AI_CONNECTION_KEY, JSON.stringify(next));
    window.sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage unavailable: the choice lasts this session only */
  }
  listeners.forEach((listener) => listener());
}

/** The reader's change (Settings, the chat's picker, OpenRouter's sign-in): kept here, and on their account when signed in. */
export function saveAiConnection(next: AiConnection): void {
  store(next);
  writeOwner({ ...readOwner(), pending: true });
  if (account) schedulePush();
}

// ---- The signed-in reader's account copy -------------------------------------

type Owner = { owner: number | null; pending: boolean };

/** What the account sync needs of the API (the shell passes its client; tests a fake). */
export type AiConnectionAccountApi = {
  get(): Promise<AiConnectionState>;
  save(connection: AiConnectionUpdate): Promise<AiConnectionState>;
};

let account: { id: number; api: AiConnectionAccountApi } | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DELAY_MS = 400;

function readOwner(): Owner {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AI_CONNECTION_OWNER_KEY) ?? "null") as Partial<Owner> | null;
    return { owner: typeof parsed?.owner === "number" ? parsed.owner : null, pending: parsed?.pending === true };
  } catch {
    return { owner: null, pending: false };
  }
}

function writeOwner(owner: Owner): void {
  try {
    window.localStorage.setItem(AI_CONNECTION_OWNER_KEY, JSON.stringify(owner));
  } catch {
    /* storage unavailable */
  }
}

function hasContent(connection: AiConnection): boolean {
  return Boolean(connection.provider) || Object.keys(connection.keys).length > 0 || Object.keys(connection.models).length > 0;
}

function toUpdate(connection: AiConnection): AiConnectionUpdate {
  return { provider: connection.provider, keys: connection.keys, models: connection.models };
}

function adopt(saved: AiConnectionState, owner: number): void {
  // The former thinking levels stay a device matter: kept as they were.
  store({ provider: saved.provider ?? null, keys: saved.keys ?? {}, models: saved.models ?? {}, thinking: aiConnection().thinking });
  writeOwner({ owner, pending: false });
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, PUSH_DELAY_MS);
}

async function pushNow(): Promise<void> {
  const target = account;
  if (!target) return;
  const sent = aiConnection();
  try {
    await target.api.save(toUpdate(sent));
    // Done, unless it changed again meanwhile (that change has its own push).
    if (account === target && aiConnection() === sent) writeOwner({ owner: target.id, pending: false });
  } catch {
    /* kept pending: sent again at the next change or sign-in */
  }
}

/**
 * Who is signed in, once the shell knows (null: a guest). For a reader: the
 * account's connection replaces this browser's — unless a change made here
 * hasn't reached it yet, or the account has none and this device has its own
 * (a guest's key, carried into the account the first time). For a guest: a
 * connection an account left here (signed out elsewhere, session ended) is
 * forgotten; the guest's own stays.
 */
export async function syncAiConnectionWithAccount(userId: number | null, api: AiConnectionAccountApi): Promise<void> {
  if (userId === null) {
    account = null;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    if (readOwner().owner !== null) forgetAiConnectionOnThisDevice();
    return;
  }
  account = { id: userId, api };
  const local = aiConnection();
  const { owner, pending } = readOwner();
  let saved: AiConnectionState;
  try {
    saved = await api.get();
  } catch {
    return; /* offline or refused: this browser's copy, as it is */
  }
  if (account?.id !== userId) return;
  const accountHasOne = saved.updated_at > 0;
  const mine = owner === userId;
  if ((mine && pending) || (owner === null && !accountHasOne && hasContent(local))) {
    writeOwner({ owner: userId, pending: true });
    await pushNow();
    return;
  }
  if (accountHasOne || owner !== null) {
    adopt(saved, userId);
    return;
  }
  writeOwner({ owner: userId, pending: false });
}

/** Sign-out: the account's connection leaves this browser (lib/forget-account.ts). */
export function forgetAiConnectionOnThisDevice(): void {
  account = null;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  try {
    window.localStorage.removeItem(AI_CONNECTION_KEY);
    window.localStorage.removeItem(AI_CONNECTION_OWNER_KEY);
    window.sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage unavailable */
  }
  cached = null;
  listeners.forEach((listener) => listener());
}

let watchingOtherTabs = false;

export function subscribeAiConnection(listener: () => void): () => void {
  // A key saved in another window of this site (OpenRouter's sign-in window)
  // reaches this one too.
  if (!watchingOtherTabs && typeof window !== "undefined") {
    watchingOtherTabs = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== AI_CONNECTION_KEY && event.key !== null) return;
      cached = null;
      listeners.forEach((each) => each());
    });
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Choose a provider (null: the server's own), keeping every key already given. */
export function chooseProvider(provider: AiProviderId | null): void {
  saveAiConnection({ ...aiConnection(), provider });
}

export function setProviderKey(provider: AiProviderId, key: string | null): void {
  const current = aiConnection();
  const keys = { ...current.keys };
  if (key && key.trim()) keys[provider] = key.trim();
  else delete keys[provider];
  saveAiConnection({ ...current, keys });
}

export function setProviderModel(provider: AiProviderId, model: string): void {
  const current = aiConnection();
  saveAiConnection({ ...current, models: { ...current.models, [provider]: model } });
}

/** A key as shown once saved: its last four characters. */
export function maskKey(key: string | undefined): string {
  return key ? `••••${key.slice(-4)}` : "";
}

/** The study's request headers for a connection (none: the server's own model). */
export function aiHeaders(connection: AiConnection = aiConnection()): Record<string, string> {
  const { provider } = connection;
  if (!provider) return {};
  const headers: Record<string, string> = { "X-QBasair-LLM-Provider": provider };
  const key = connection.keys[provider];
  const model = connection.models[provider];
  if (key) headers["X-QBasair-LLM-Key"] = key;
  if (model) headers["X-QBasair-LLM-Model"] = model;
  // No thinking level: each model's own default is enough for the study.
  return headers;
}

/**
 * The models offered in the chat: only the recommended ones among those the
 * provider lists (`AiProviderItem.prefer`, in that order), plus the one already
 * chosen. A provider listing none of them shows its whole list.
 */
export function recommendedModels(prefer: readonly string[], names: readonly string[], current?: string): string[] {
  const kept: string[] = [];
  for (const wanted of prefer) {
    for (const name of names) if (name.includes(wanted) && !kept.includes(name)) kept.push(name);
  }
  if (!kept.length) return [...names];
  if (current && names.includes(current) && !kept.includes(current)) kept.unshift(current);
  return kept;
}

/** The model to preselect among those a provider lists. */
export function preferredModel(prefer: readonly string[], names: readonly string[]): string | null {
  for (const wanted of prefer) {
    const found = names.find((name) => name.includes(wanted));
    if (found) return found;
  }
  return names[0] ?? null;
}

export function resetAiConnectionForTests(): void {
  cached = null;
  account = null;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  listeners.clear();
}

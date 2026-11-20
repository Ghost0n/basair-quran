/**
 * The reader's AI connection (Settings → «الذكاء الاصطناعي», docs/ai-connections.md):
 * which provider the study uses — the server's own when none is chosen — and,
 * per provider, the reader's key and chosen model. Kept on this device only
 * (keys never go to our server except with the study's own requests); a key
 * can be forgotten from Settings.
 */
import type { AiProviderId, ThinkingLevel } from "@q-basair/shared";

export type AiConnection = {
  /** null: the server's own model. */
  provider: AiProviderId | null;
  keys: Partial<Record<AiProviderId, string>>;
  models: Partial<Record<AiProviderId, string>>;
  /** Per provider, the thinking level picked in the chat (none: the model's default). */
  thinking: Partial<Record<AiProviderId, ThinkingLevel>>;
};

export const AI_CONNECTION_KEY = "qb.ai.connection";
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

export function saveAiConnection(next: AiConnection): void {
  cached = next;
  try {
    window.localStorage.setItem(AI_CONNECTION_KEY, JSON.stringify(next));
    window.sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage unavailable: the choice lasts this session only */
  }
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

/** The thinking level for a provider (null: the model's default). */
export function setProviderThinking(provider: AiProviderId, level: ThinkingLevel | null): void {
  const current = aiConnection();
  const thinking = { ...current.thinking };
  if (level) thinking[provider] = level;
  else delete thinking[provider];
  saveAiConnection({ ...current, thinking });
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
  const thinking = connection.thinking[provider];
  if (thinking) headers["X-QBasair-LLM-Thinking"] = thinking;
  return headers;
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
  listeners.clear();
}

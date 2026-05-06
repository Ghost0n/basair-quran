import type { OllamaModelItem } from "@q-basair/shared";

export interface ClientResearchSettings {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embedModel: string;
}

export const RESEARCH_SETTINGS_STORAGE_KEY = "qbasair.research.ollama";

export const DEFAULT_RESEARCH_SETTINGS: ClientResearchSettings = {
  apiKey: "",
  baseUrl: "https://ollama.com",
  chatModel: "gemma4:31b-cloud",
  embedModel: "nomic-embed-text",
};

export function loadClientResearchSettings(): ClientResearchSettings {
  if (typeof window === "undefined") {
    return DEFAULT_RESEARCH_SETTINGS;
  }

  try {
    const raw = window.sessionStorage.getItem(RESEARCH_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_RESEARCH_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<ClientResearchSettings>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : DEFAULT_RESEARCH_SETTINGS.apiKey,
      baseUrl: typeof parsed.baseUrl === "string" && parsed.baseUrl.trim() ? parsed.baseUrl : DEFAULT_RESEARCH_SETTINGS.baseUrl,
      chatModel: typeof parsed.chatModel === "string" && parsed.chatModel.trim() ? parsed.chatModel : DEFAULT_RESEARCH_SETTINGS.chatModel,
      embedModel: typeof parsed.embedModel === "string" && parsed.embedModel.trim() ? parsed.embedModel : DEFAULT_RESEARCH_SETTINGS.embedModel,
    };
  } catch {
    return DEFAULT_RESEARCH_SETTINGS;
  }
}

export function saveClientResearchSettings(settings: ClientResearchSettings) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(RESEARCH_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function clearClientResearchSettings() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(RESEARCH_SETTINGS_STORAGE_KEY);
}

export function buildResearchHeaders(settings: ClientResearchSettings): Record<string, string> {
  const headers: Record<string, string> = {};
  if (settings.apiKey.trim()) {
    headers["X-QBasair-Ollama-Key"] = settings.apiKey.trim();
  }
  if (settings.chatModel.trim()) {
    headers["X-QBasair-Ollama-Chat-Model"] = settings.chatModel.trim();
  }
  if (settings.embedModel.trim()) {
    headers["X-QBasair-Ollama-Embed-Model"] = settings.embedModel.trim();
  }
  if (settings.baseUrl.trim()) {
    headers["X-QBasair-Ollama-Base-Url"] = settings.baseUrl.trim();
  }
  return headers;
}

export function getChatModels(models: OllamaModelItem[]) {
  const chatModels = models.filter((model) => !model.capabilities.includes("embedding"));
  return chatModels.length > 0 ? chatModels : models;
}

export function getEmbeddingModels(models: OllamaModelItem[]) {
  const embedModels = models.filter((model) => model.capabilities.includes("embedding"));
  return embedModels.length > 0 ? embedModels : models;
}

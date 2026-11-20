// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import {
  AI_CONNECTION_KEY,
  aiConnection,
  aiHeaders,
  chooseProvider,
  maskKey,
  preferredModel,
  resetAiConnectionForTests,
  setProviderKey,
  setProviderModel,
  setProviderThinking,
} from "./ai-connection";
import { pkcePair, signInUrl } from "./openrouter-signin";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetAiConnectionForTests();
});

describe("the AI connection (Settings → «الذكاء الاصطناعي»)", () => {
  it("uses the server's own model until a provider is chosen", () => {
    expect(aiConnection().provider).toBeNull();
    expect(aiHeaders()).toEqual({});
  });

  it("sends the chosen provider, its key and model — never an address", () => {
    setProviderKey("anthropic", "  sk-ant-123456  ");
    setProviderModel("anthropic", "claude-sonnet-4");
    chooseProvider("anthropic");
    expect(aiHeaders()).toEqual({
      "X-QBasair-LLM-Provider": "anthropic",
      "X-QBasair-LLM-Key": "sk-ant-123456",
      "X-QBasair-LLM-Model": "claude-sonnet-4",
    });
    // Kept on the device, and every provider keeps its own key.
    setProviderKey("openai", "sk-openai");
    chooseProvider("openai");
    resetAiConnectionForTests();
    expect(aiConnection().keys).toEqual({ anthropic: "sk-ant-123456", openai: "sk-openai" });
    expect(JSON.parse(window.localStorage.getItem(AI_CONNECTION_KEY) as string).provider).toBe("openai");
  });

  it("sends the thinking level picked for the provider, and none once back to the default", () => {
    setProviderKey("openai", "sk-openai");
    chooseProvider("openai");
    setProviderThinking("openai", "high");
    expect(aiHeaders()["X-QBasair-LLM-Thinking"]).toBe("high");
    setProviderThinking("openai", null);
    expect(aiHeaders()["X-QBasair-LLM-Thinking"]).toBeUndefined();
  });

  it("forgets a key, and shows a saved one by its last four characters", () => {
    setProviderKey("groq", "gsk_abcdefgh");
    expect(maskKey(aiConnection().keys.groq)).toBe("••••efgh");
    setProviderKey("groq", null);
    expect(aiConnection().keys.groq).toBeUndefined();
  });

  it("carries over the study page's former Ollama key once", () => {
    window.sessionStorage.setItem("qbasair.research.ollama", JSON.stringify({ apiKey: "ollama-key", chatModel: "gpt-oss:120b", baseUrl: "" }));
    expect(aiConnection()).toEqual({ provider: "ollama", keys: { ollama: "ollama-key" }, models: { ollama: "gpt-oss:120b" }, thinking: {} });
    chooseProvider("ollama");
    expect(window.sessionStorage.getItem("qbasair.research.ollama")).toBeNull();
  });

  it("preselects the first preferred model the provider lists", () => {
    expect(preferredModel(["gpt-4.1-mini", "gpt-4o-mini"], ["gpt-4o", "gpt-4o-mini-2024", "o3"])).toBe("gpt-4o-mini-2024");
    expect(preferredModel(["nothing"], ["b", "a"])).toBe("b");
    expect(preferredModel([], [])).toBeNull();
  });
});

describe("OpenRouter's sign-in (PKCE)", () => {
  it("makes a verifier and its S256 challenge, and the sign-in address", async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(challenge).toBe(expected);
    const url = new URL(signInUrl("https://basair.test/connect/openrouter", challenge));
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("callback_url")).toBe("https://basair.test/connect/openrouter");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

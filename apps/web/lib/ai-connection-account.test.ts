// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiConnectionState, AiConnectionUpdate } from "@q-basair/shared";

import {
  AI_CONNECTION_KEY,
  AI_CONNECTION_OWNER_KEY,
  aiConnection,
  chooseProvider,
  resetAiConnectionForTests,
  setProviderKey,
  syncAiConnectionWithAccount,
  type AiConnectionAccountApi,
} from "./ai-connection";
import { forgetAccountOnThisDevice } from "./forget-account";

const EMPTY: AiConnectionState = { provider: null, keys: {}, models: {}, updated_at: 0 };

/** The account's copy on the server, as `/user/ai-connection` keeps it. */
function fakeAccount(initial: AiConnectionState = EMPTY) {
  let saved = initial;
  const sent: AiConnectionUpdate[] = [];
  const api: AiConnectionAccountApi = {
    get: vi.fn(async () => saved),
    save: vi.fn(async (connection: AiConnectionUpdate) => {
      sent.push(connection);
      saved = { ...connection, updated_at: 100 + sent.length };
      return saved;
    }),
  };
  return { api, sent, current: () => saved };
}

function owner() {
  return JSON.parse(window.localStorage.getItem(AI_CONNECTION_OWNER_KEY) ?? "null");
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetAiConnectionForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the AI connection follows the reader's account", () => {
  it("finds on a new device, after sign-in, the key saved on another", async () => {
    const account = fakeAccount({ provider: "ollama", keys: { ollama: "sk-ollama-1234" }, models: { ollama: "gpt-oss:120b" }, updated_at: 50 });
    await syncAiConnectionWithAccount(7, account.api);
    expect(aiConnection()).toMatchObject({ provider: "ollama", keys: { ollama: "sk-ollama-1234" }, models: { ollama: "gpt-oss:120b" } });
    expect(owner()).toEqual({ owner: 7, pending: false });
    expect(account.sent).toEqual([]);
  });

  it("carries a guest's own key into an account that has none", async () => {
    setProviderKey("openai", "sk-openai-guest");
    chooseProvider("openai");
    const account = fakeAccount();
    await syncAiConnectionWithAccount(7, account.api);
    expect(account.sent).toEqual([{ provider: "openai", keys: { openai: "sk-openai-guest" }, models: {} }]);
    expect(owner()).toEqual({ owner: 7, pending: false });
  });

  it("prefers the account's connection over a guest's left on the device", async () => {
    setProviderKey("openai", "sk-openai-guest");
    const account = fakeAccount({ provider: "anthropic", keys: { anthropic: "sk-ant-account" }, models: {}, updated_at: 50 });
    await syncAiConnectionWithAccount(7, account.api);
    expect(aiConnection().keys).toEqual({ anthropic: "sk-ant-account" });
    expect(account.sent).toEqual([]);
  });

  it("saves to the account what the signed-in reader changes", async () => {
    const account = fakeAccount();
    await syncAiConnectionWithAccount(7, account.api);
    setProviderKey("mistral", "sk-mistral-1");
    chooseProvider("mistral");
    expect(owner().pending).toBe(true);
    await vi.runAllTimersAsync();
    // The two changes reach the account as one.
    expect(account.sent).toEqual([{ provider: "mistral", keys: { mistral: "sk-mistral-1" }, models: {} }]);
    expect(owner()).toEqual({ owner: 7, pending: false });

    setProviderKey("mistral", null); // «نسيان المفتاح»
    await vi.runAllTimersAsync();
    expect(account.current().keys).toEqual({});
  });

  it("sends at the next sign-in a change the account didn't receive", async () => {
    const account = fakeAccount({ provider: "openai", keys: { openai: "sk-old" }, models: {}, updated_at: 50 });
    await syncAiConnectionWithAccount(7, account.api);
    vi.mocked(account.api.save).mockRejectedValueOnce(new Error("offline"));
    setProviderKey("openai", "sk-new");
    await vi.runAllTimersAsync();
    expect(owner().pending).toBe(true);

    resetAiConnectionForTests(); // the next visit
    await syncAiConnectionWithAccount(7, account.api);
    expect(account.current().keys).toEqual({ openai: "sk-new" });
    expect(aiConnection().keys).toEqual({ openai: "sk-new" });
  });

  it("leaves the browser at sign-out, and comes back at the next sign-in", async () => {
    const account = fakeAccount({ provider: "ollama", keys: { ollama: "sk-ollama-1234" }, models: {}, updated_at: 50 });
    await syncAiConnectionWithAccount(7, account.api);
    forgetAccountOnThisDevice();
    expect(window.localStorage.getItem(AI_CONNECTION_KEY)).toBeNull();
    expect(aiConnection()).toMatchObject({ provider: null, keys: {} });

    await syncAiConnectionWithAccount(7, account.api);
    expect(aiConnection().keys).toEqual({ ollama: "sk-ollama-1234" });
  });

  it("forgets an account's key a guest finds in the browser (session ended elsewhere), never the guest's own", async () => {
    const account = fakeAccount({ provider: "ollama", keys: { ollama: "sk-ollama-1234" }, models: {}, updated_at: 50 });
    await syncAiConnectionWithAccount(7, account.api);
    await syncAiConnectionWithAccount(null, account.api);
    expect(aiConnection().keys).toEqual({});

    setProviderKey("groq", "gsk-guest");
    await syncAiConnectionWithAccount(null, account.api);
    expect(aiConnection().keys).toEqual({ groq: "gsk-guest" });
    await vi.runAllTimersAsync();
    expect(account.sent).toEqual([]); // a guest's key never goes to an account
  });

  it("never hands one account's key to another signing in on the same browser", async () => {
    const first = fakeAccount({ provider: "ollama", keys: { ollama: "sk-first" }, models: {}, updated_at: 50 });
    await syncAiConnectionWithAccount(7, first.api);
    resetAiConnectionForTests();
    const second = fakeAccount();
    await syncAiConnectionWithAccount(8, second.api);
    expect(aiConnection().keys).toEqual({});
    expect(second.sent).toEqual([]);
  });

  it("keeps this browser's copy when the account can't be reached", async () => {
    setProviderKey("openai", "sk-openai-guest");
    const api: AiConnectionAccountApi = { get: vi.fn(async () => Promise.reject(new Error("offline"))), save: vi.fn() };
    await syncAiConnectionWithAccount(7, api);
    expect(aiConnection().keys).toEqual({ openai: "sk-openai-guest" });
  });
});

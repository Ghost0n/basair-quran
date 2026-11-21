// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.hoisted(() => vi.fn());

vi.mock("@q-basair/api-client", () => ({
  createQBasairApiClient: () => ({ exchangeOpenRouterKey: exchange }),
}));

import { aiConnection } from "./ai-connection";
import {
  OPENROUTER_CODE_MESSAGE,
  OPENROUTER_WINDOW,
  finishOpenRouterSignIn,
  handCodeToOpener,
  startOpenRouterSignIn,
} from "./openrouter-signin";

const VERIFIER_KEY = "qb.openrouter.verifier";

beforeEach(() => {
  window.localStorage.clear();
  exchange.mockReset();
  exchange.mockResolvedValue({ key: "sk-or-test" });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.name = "";
});

describe("startOpenRouterSignIn", () => {
  it("opens OpenRouter in a window and leaves the page where it is", async () => {
    const popup = { closed: false, location: { href: "about:blank" }, focus: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});

    await startOpenRouterSignIn();

    expect(open).toHaveBeenCalledWith("about:blank", OPENROUTER_WINDOW, expect.stringContaining("popup"));
    expect(popup.location.href).toMatch(/^https:\/\/openrouter\.ai\/auth\?/);
    expect(popup.location.href).toContain(encodeURIComponent("/connect/openrouter"));
    expect(assign).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(VERIFIER_KEY)).toBeTruthy();
  });

  it("goes there itself when the window is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});

    await startOpenRouterSignIn();

    expect(assign).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/openrouter\.ai\/auth\?/));
  });
});

describe("finishOpenRouterSignIn", () => {
  it("exchanges the code once and makes OpenRouter the provider", async () => {
    window.localStorage.setItem(VERIFIER_KEY, "verifier");

    expect(await finishOpenRouterSignIn("code-1")).toBe(true);
    expect(exchange).toHaveBeenCalledWith("code-1", "verifier");
    expect(aiConnection().provider).toBe("openrouter");
    expect(aiConnection().keys.openrouter).toBe("sk-or-test");

    // The verifier is taken: a second exchange of the same sign-in never happens.
    expect(await finishOpenRouterSignIn("code-1")).toBe(false);
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});

describe("handCodeToOpener", () => {
  it("does nothing outside the sign-in window", () => {
    expect(handCodeToOpener("code")).toBe(false);
  });

  it("posts the code to the page that opened the window", () => {
    window.name = OPENROUTER_WINDOW;
    const postMessage = vi.fn();
    vi.spyOn(window, "opener", "get").mockReturnValue({ location: window.location, postMessage } as unknown as Window);

    expect(handCodeToOpener("code-2")).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: OPENROUTER_CODE_MESSAGE, code: "code-2" }, window.location.origin);
  });

  it("reports when the opener is gone", () => {
    window.name = OPENROUTER_WINDOW;
    vi.spyOn(window, "opener", "get").mockReturnValue(null);
    expect(handCodeToOpener("code-3")).toBe(false);
  });
});

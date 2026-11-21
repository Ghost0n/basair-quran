// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: number }, ready: true }));

vi.mock("@/lib/config", () => ({ AUTH_ENABLED: true, API_BASE_URL: "" }));
vi.mock("@/lib/auth-session-context", () => ({ useAuthSession: () => session }));
vi.mock("@/features/auth/identity-flow", () => ({
  identityApi: {
    getAiProviders: () =>
      Promise.resolve([{ id: "openai", name: "OpenAI", key_url: "https://x", signin: false, prefer: [], thinking: ["low", "medium", "high"] }]),
  },
}));

import { chooseProvider, resetAiConnectionForTests, setProviderKey } from "@/lib/ai-connection";

import { StudioNotices } from "./studio-notices";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

async function render(onOpen = vi.fn()) {
  await act(async () => {
    root.render(<StudioNotices onOpenAiSettings={onOpen} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host.querySelector(".qb-studio-notice");
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetAiConnectionForTests();
  session.user = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the study's notices", () => {
  it("asks a guest to sign in or create an account, and can be set aside for the tab", async () => {
    const notice = await render();
    const links = [...(notice?.querySelectorAll("a") ?? [])].map((link) => link.getAttribute("href"));
    expect(links).toEqual(["/login", "/login?tab=signup"]);
    await act(async () => {
      (notice?.querySelector(".x") as HTMLButtonElement).click();
    });
    // Next: Basair's own model.
    expect(host.querySelector(".qb-studio-notice a")).toBeNull();
    expect(window.sessionStorage.getItem("qb.studio.signInNotice")).toBe("1");
  });

  it("offers to connect a provider while the study runs on Basair's model", async () => {
    session.user = { id: 1 };
    const onOpen = vi.fn();
    const notice = await render(onOpen);
    expect(notice?.getAttribute("role")).toBe("status");
    await act(async () => {
      (notice?.querySelector(".ok") as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalled();
  });

  it("says when the chosen provider's key is missing, and says nothing once it is there", async () => {
    session.user = { id: 1 };
    chooseProvider("openai");
    const missing = await render();
    expect(missing?.getAttribute("role")).toBe("alert");
    expect(missing?.querySelector(".x")).toBeNull();
    await act(async () => setProviderKey("openai", "sk-reader"));
    expect(host.querySelector(".qb-studio-notice")).toBeNull();
  });
});

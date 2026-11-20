// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateAccount, toggleTheme, signOutEverywhere, theme } = vi.hoisted(() => ({
  updateAccount: vi.fn(async () => undefined),
  toggleTheme: vi.fn(),
  signOutEverywhere: vi.fn(async () => undefined),
  theme: { value: "dark" },
}));

vi.mock("@/lib/config", () => ({ AUTH_ENABLED: true, API_BASE_URL: "" }));
vi.mock("@/lib/auth-session-context", () => ({
  useAuthSession: () => ({ user: { id: 1, name: "Reader", email: "reader@example.test", avatar: "ba" }, ready: true }),
}));
vi.mock("@/components/sheet", () => ({ usePhoneSheets: () => false, Sheet: () => null }));
vi.mock("@/features/shell/workspace-context", () => ({
  useWorkspace: () => ({ state: { theme: theme.value }, actions: { toggleTheme } }),
}));
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ preferences: { numerals: "auto" }, account: { numerals: "auto" }, updateAccount }),
}));
vi.mock("@/lib/i18n/provider", () => ({
  useI18n: () => ({ locale: "en", info: { code: "en", numerals: "latin" }, setLocale: vi.fn() }),
}));
vi.mock("@/features/auth/identity-flow", () => ({ clearGuestChoice: vi.fn(), signOutEverywhere }));

import { AccountMenu } from "./account-menu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(async () => {
  theme.value = "dark";
  toggleTheme.mockClear();
  updateAccount.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AccountMenu onOpenSettings={() => {}} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.documentElement.removeAttribute("dir");
});

async function open(dir: "ltr" | "rtl", rect: { left: number; right: number; bottom: number }) {
  document.documentElement.setAttribute("dir", dir);
  const button = host.querySelector<HTMLButtonElement>(".qb-account-btn")!;
  button.style.direction = dir;
  button.getBoundingClientRect = () => ({ ...rect, top: rect.bottom - 40, width: rect.right - rect.left, height: 40, x: rect.left, y: 0, toJSON() {} }) as DOMRect;
  await act(async () => button.click());
  return host.querySelector<HTMLElement>(".qb-account-pop")!;
}

describe("AccountMenu", () => {
  it("opens just past the rail on its own side, in English (rail on the left) and in Arabic (on the right)", async () => {
    const ltr = await open("ltr", { left: 0, right: 72, bottom: 700 });
    expect(ltr.style.insetInlineStart).toBe("80px");
    await act(async () => host.querySelector<HTMLButtonElement>(".qb-account-btn")!.click());
    const rtl = await open("rtl", { left: window.innerWidth - 72, right: window.innerWidth, bottom: 700 });
    expect(rtl.style.insetInlineStart).toBe("80px");
  });

  it("holds quick settings — language, digits, theme — then all settings and sign out", async () => {
    const pop = await open("ltr", { left: 0, right: 72, bottom: 700 });
    expect(pop.textContent).toContain("Reader");
    expect(pop.querySelectorAll(".qb-account-row")).toHaveLength(3);
    // Digits: the language's own (Latin for English) selected.
    expect(pop.querySelectorAll(".qb-select-btn")[1].textContent).toContain("012");

    const [light, dark] = [...pop.querySelectorAll<HTMLButtonElement>(".qb-account-theme button")];
    expect(dark.getAttribute("aria-pressed")).toBe("true");
    await act(async () => dark.click());
    expect(toggleTheme).not.toHaveBeenCalled();
    await act(async () => light.click());
    expect(toggleTheme).toHaveBeenCalledTimes(1);

    await act(async () => pop.querySelector<HTMLButtonElement>(".qb-account-signout")!.click());
    expect(signOutEverywhere).toHaveBeenCalledWith("/");
  });
});

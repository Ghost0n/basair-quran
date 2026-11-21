// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The landing's picker reuses the preferences and the locale of the app.
const updateAccount = vi.fn(async () => undefined);
const setLocale = vi.fn(async () => undefined);
let numerals = "auto";
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    preferences: { numerals },
    account: { numerals, ui_language: "ar" },
    updateAccount,
  }),
}));
vi.mock("@/lib/i18n/provider", () => ({
  useI18n: () => ({ locale: "ar", info: { code: "ar", numerals: "arabic-indic" }, setLocale, explicit: false }),
}));

import { LandingLocalePicker } from "./landing-locale-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

async function mount() {
  await act(async () => root.render(<LandingLocalePicker />));
}

beforeEach(async () => {
  numerals = "auto";
  updateAccount.mockClear();
  setLocale.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<LandingLocalePicker />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const triggers = () => [...host.querySelectorAll<HTMLButtonElement>(".qb-select-btn")];

async function choose(trigger: HTMLButtonElement, label: string) {
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent?.trim() === label,
  );
  expect(option, `option «${label}»`).toBeDefined();
  await act(async () => {
    option!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
}

describe("LandingLocalePicker", () => {
  it("offers the language and the digits, the language's own selected, each written in its own digits", async () => {
    const [language, digits] = triggers();
    expect(triggers()).toHaveLength(2);
    expect(language.textContent).toContain("العربية");
    expect(digits.textContent).toContain("٠١٢");
    await act(async () => digits.click());
    const labels = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map((node) => node.textContent?.trim());
    expect(labels).toEqual(["٠١٢", "012", "۰۱۲"]);
  });

  it("switches the interface language; automatic digits simply follow it", async () => {
    await choose(triggers()[0], "English");
    expect(setLocale).toHaveBeenCalledWith("en");
    expect(updateAccount).toHaveBeenCalledWith({ ui_language: "en" });
  });

  it("brings the language's digits back after the reader chose other digits", async () => {
    numerals = "latin";
    await mount();
    await choose(triggers()[0], "فارسی");
    expect(updateAccount).toHaveBeenCalledWith({ ui_language: "fa", numerals: "auto" });
  });

  it("saves the chosen digits; the language's own go back to following the language", async () => {
    await choose(triggers()[1], "۰۱۲");
    expect(updateAccount).toHaveBeenCalledWith({ numerals: "persian" });
    numerals = "persian";
    await mount();
    await choose(triggers()[1], "٠١٢");
    expect(updateAccount).toHaveBeenLastCalledWith({ numerals: "auto" });
  });

  it("switches the theme like the app does: on the page, on this device and on the account", async () => {
    window.localStorage.removeItem("theme");
    document.body.classList.remove("light", "light-mode");
    await mount();
    const toggle = host.querySelector<HTMLButtonElement>(".qb-site-theme")!;
    expect(toggle.getAttribute("aria-label")).toBe("التبديل إلى السِّمة الفاتحة");
    await act(async () => toggle.click());
    expect(document.body.classList.contains("light-mode")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(updateAccount).toHaveBeenCalledWith({ theme: "light" });
    expect(toggle.getAttribute("aria-label")).toBe("التبديل إلى السِّمة الداكنة");
    await act(async () => toggle.click());
    expect(document.body.classList.contains("light-mode")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });
});

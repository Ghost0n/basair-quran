// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The landing's picker reuses the preferences and the locale of the app.
const updateAccount = vi.fn(async () => undefined);
const setLocale = vi.fn(async () => undefined);
let numerals = "arabic-indic";
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    preferences: { numerals },
    account: { numerals, ui_language: "ar" },
    updateAccount,
  }),
}));
vi.mock("@/lib/i18n/provider", () => ({
  useI18n: () => ({ locale: "ar", setLocale, explicit: false }),
}));

import { LandingLocalePicker } from "./landing-locale-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

async function mount() {
  await act(async () => root.render(<LandingLocalePicker />));
}

beforeEach(async () => {
  numerals = "arabic-indic";
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
  it("offers the language and the digits, each digits option written in its own digits", () => {
    const [language, digits] = triggers();
    expect(triggers()).toHaveLength(2);
    expect(language.textContent).toContain("العربية");
    expect(digits.textContent).toContain("٠١٢");
  });

  it("switches the interface language and saves it with the language's usual digits", async () => {
    await choose(triggers()[0], "English");
    expect(setLocale).toHaveBeenCalledWith("en");
    expect(updateAccount).toHaveBeenCalledWith({ ui_language: "en", numerals: "latin" });
  });

  it("brings the language's digits even after the reader chose other digits", async () => {
    numerals = "latin";
    await mount();
    await choose(triggers()[0], "فارسی");
    expect(updateAccount).toHaveBeenCalledWith({ ui_language: "fa", numerals: "persian" });
  });

  it("saves the chosen digits", async () => {
    await choose(triggers()[1], "۰۱۲");
    expect(updateAccount).toHaveBeenCalledWith({ numerals: "persian" });
  });
});

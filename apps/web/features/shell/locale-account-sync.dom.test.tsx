// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { resolveNumerals } from "@/lib/numerals";

// The language chosen on another device follows the account; the digits need
// nothing from this sync: they default to "auto", the digits of the language
// on screen (docs/i18n.md), so a first visit in English shows 012 without any
// write to the account, on the landing page as in the app.
const updateAccount = vi.fn(async () => undefined);
const setLocale = vi.fn(async () => undefined);
let state = { locale: "en", explicit: false, accountLanguage: "ar", accountNumerals: "auto" };
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    ready: true,
    account: { ui_language: state.accountLanguage, numerals: state.accountNumerals },
    updateAccount,
  }),
}));
vi.mock("@/lib/i18n/provider", () => ({
  useI18n: () => ({ locale: state.locale, setLocale, explicit: state.explicit }),
}));

import { LocaleAccountSync } from "./locale-account-sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount() {
  updateAccount.mockClear();
  setLocale.mockClear();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<LocaleAccountSync />));
  await act(async () => root.unmount());
  host.remove();
}

describe("LocaleAccountSync", () => {
  it("gives a first visit in English its Latin digits without writing them to the account", async () => {
    state = { locale: "en", explicit: false, accountLanguage: "ar", accountNumerals: "auto" };
    await mount();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(resolveNumerals(state.accountNumerals, "latin")).toBe("latin");
  });

  it("follows the account's language on a device without its own choice", async () => {
    state = { locale: "en", explicit: false, accountLanguage: "fr", accountNumerals: "auto" };
    await mount();
    expect(setLocale).toHaveBeenCalledWith("fr");
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("keeps the language chosen on this device", async () => {
    state = { locale: "en", explicit: true, accountLanguage: "fr", accountNumerals: "auto" };
    await mount();
    expect(setLocale).not.toHaveBeenCalled();
  });
});

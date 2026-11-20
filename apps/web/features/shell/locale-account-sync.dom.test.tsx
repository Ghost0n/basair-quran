// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

// A first web visit in the browser's language (no explicit choice, nothing on
// the account): the language's usual digits come with it. Mounted by the app
// shell and by the landing page (SiteLanding), which a visitor sees first.
const updateAccount = vi.fn(async () => undefined);
const setLocale = vi.fn(async () => undefined);
let state = { locale: "en", explicit: false, accountLanguage: "ar", accountNumerals: "arabic-indic" };
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
  it("gives a first visit in English its Latin digits", async () => {
    state = { locale: "en", explicit: false, accountLanguage: "ar", accountNumerals: "arabic-indic" };
    await mount();
    expect(updateAccount).toHaveBeenCalledWith({ numerals: "latin" });
  });

  it("leaves digits the reader set themselves", async () => {
    state = { locale: "en", explicit: false, accountLanguage: "ar", accountNumerals: "persian" };
    await mount();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("follows the account's language on a device without its own choice", async () => {
    state = { locale: "en", explicit: false, accountLanguage: "fr", accountNumerals: "latin" };
    await mount();
    expect(setLocale).toHaveBeenCalledWith("fr");
    expect(updateAccount).not.toHaveBeenCalled();
  });
});

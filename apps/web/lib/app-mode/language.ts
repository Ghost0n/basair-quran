/**
 * One language choice = the interface language and the translation of
 * meanings shown under each ayah (docs/offline-app.md). Installs both packs,
 * then records the choice in the user's preferences. The digits are a
 * setting of their own: only the first choice (onboarding, `adoptNumerals`)
 * takes the language's usual digits; a later change of language keeps them.
 */
import { localeInfo } from "@/lib/i18n/locales";

import { PackError, type Progress } from "./packs";
import { appRuntime } from "./runtime";

/** Languages usable without downloading anything: English ships with the app, Arabic is the source. */
export const BUILT_IN_LANGUAGES = new Set(["en", "ar"]);

export async function chooseLanguage(
  code: string,
  onProgress?: (progress: Progress) => void,
  { adoptNumerals = false }: { adoptNumerals?: boolean } = {},
): Promise<void> {
  const { packs } = await appRuntime();
  let translation: string | null = null;
  try {
    translation = await packs.installLanguage(code, onProgress);
  } catch (error) {
    // Offline with a built-in language: switch now, the translation can come later.
    if (!(error instanceof PackError && BUILT_IN_LANGUAGES.has(code))) throw error;
  }
  await fetch("/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ui_language: code,
      ...(adoptNumerals ? { numerals: localeInfo(code).numerals } : {}),
      translations: translation ? [translation] : [],
    }),
  });
}

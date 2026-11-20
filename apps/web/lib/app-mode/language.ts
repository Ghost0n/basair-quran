/**
 * One language choice = the interface language and the translation of
 * meanings shown under each ayah (docs/offline-app.md). Installs both packs,
 * then records the choice in the user's preferences. With `adoptNumerals`
 * (onboarding, Settings) the digits go back to "auto": the language's own.
 */
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
      ...(adoptNumerals ? { numerals: "auto" } : {}),
      translations: translation ? [translation] : [],
    }),
  });
}

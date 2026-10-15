"use client";

import "./settings.css";

import type { NumeralScript } from "@q-basair/shared";

import { SelectMenu } from "@/components/select-menu";
import { AccountSettings } from "@/features/identity/account-settings";
import { LanguageSelect } from "./language-select";
import { DownloadsSettings } from "@/features/app-mode/downloads-settings";

import { TranslationsSettings } from "./translations-settings";
import { MUSHAF_EDITIONS, resolveEdition } from "@/lib/mushaf-defaults";
import { usePreferences } from "@/lib/preferences-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import { t } from "@/lib/i18n";

const NUMERAL_OPTIONS: { value: NumeralScript; label: string }[] = [
  { value: "arabic-indic", get label() {
    return t("هنديّة ٠١٢");
  } },
  { value: "latin", get label() {
    return t("لاتينية 012");
  } },
  { value: "persian", get label() {
    return t("فارسيّة ۰۱۲");
  } },
];

/**
 * Settings — the CANONICAL home for every preference, ordered from what a
 * reader changes most to what they set once: display (theme first — on phones
 * this screen is the theme's home), the muṣḥaf, translations, offline
 * downloads, then the account (sign-out last). What only shows its effect in
 * a screen of its own stays there: the reading mode and text size in the
 * reader's «العرض», the study's mode and depth in the study page. (The UI is Arabic-only in v1;
 * `ui_language` stays in the API for the future i18n work.) Quick
 * Settings (the ⚙ top-bar popover) is a shortcut to the handful of these a
 * reader changes mid-session; both write the same account preferences, so they
 * stay in lockstep. Theme delegates to its workspace home; the rest (including
 * the mushaf edition) persist via PreferencesProvider.updateAccount.
 */
export function SettingsScreen() {
  const { preferences, updateAccount } = usePreferences();
  const { state, actions } = useWorkspace();

  const edition = state.edition;

  return (
    <div className="qb-settings">
      <div className="qb-settings-h">
        <div className="kicker">{t("الإعدادات")}</div>
        <h2>{t("التفضيلات")}</h2>
      </div>

      <div className="qb-settings-grid">

        <section className="qb-setting-card">
          <h3>{t("العرض")}</h3>
          <p className="card-sub">{t("اللغة والسمة وطريقة عرض الأرقام في الواجهة.")}</p>
          <div className="qb-setting-row">
            <label>{t("السمة")}</label>
            <div className="qb-setting-seg qb-fit-choice" data-autofit="2">
              <button
                type="button"
                className={state.theme === "dark" ? "active" : ""}
                aria-pressed={state.theme === "dark"}
                onClick={() => state.theme !== "dark" && actions.toggleTheme()}
              >
                {t("داكنة")}
              </button>
              <button
                type="button"
                className={state.theme === "light" ? "active" : ""}
                aria-pressed={state.theme === "light"}
                onClick={() => state.theme !== "light" && actions.toggleTheme()}
              >
                {t("فاتحة")}
              </button>
            </div>
          </div>
          <div className="qb-setting-row">
            <label>
              {t("لغة الواجهة")} <span className="en-hint">· Language</span>
            </label>
            <LanguageSelect />
          </div>
          <div className="qb-setting-row">
            <label>{t("الأرقام")}</label>
            <div className="qb-setting-seg qb-fit-choice" data-autofit="2">
              {NUMERAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={preferences.numerals === option.value ? "active" : ""}
                  aria-pressed={preferences.numerals === option.value}
                  onClick={() => void updateAccount({ numerals: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="qb-setting-card">
          <h3>{t("القراءة والمصحف")}</h3>
          <div className="qb-setting-row">
            <label>{t("المصحف")}</label>
            <SelectMenu
              className="qb-setting-menu"
              ariaLabel={t("المصحف")}
              value={edition.id}
              options={MUSHAF_EDITIONS.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(next) => void updateAccount({ mushaf_edition: resolveEdition(next).id })}
            />
          </div>
          <p className="card-sub">{edition.description}</p>
        </section>

        <TranslationsSettings />

        <DownloadsSettings />

        <AccountSettings />

      </div>
    </div>
  );
}

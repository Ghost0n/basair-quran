"use client";

import { useState } from "react";

import "./settings.css";

import type { NumeralScript } from "@q-basair/shared";

import { SelectMenu } from "@/components/select-menu";
import { AccountSettings } from "@/features/identity/account-settings";
import { LanguageSelect } from "./language-select";
import { DownloadsSettings } from "@/features/app-mode/downloads-settings";

import { TranslationsSettings } from "./translations-settings";
import { MUSHAF_EDITIONS, resolveEdition } from "@/lib/mushaf-defaults";
import { READER_MODES, resolveReaderMode } from "@/features/reading/reader-modes";
import { useCompactReader } from "@/features/reading/use-wide-screen";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { setTransparency, useTransparency } from "@/lib/transparency";
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

const DEPTH_OPTIONS: { value: "fast" | "balanced" | "deep"; label: string }[] = [
  { value: "fast", get label() {
    return t("سريع");
  } },
  { value: "balanced", get label() {
    return t("متوازن");
  } },
  { value: "deep", get label() {
    return t("عميق");
  } },
];

/**
 * Settings — the CANONICAL home for every preference: account & session,
 * reading & muṣḥaf, display, and guided research. (The UI is Arabic-only in v1;
 * `ui_language` stays in the API for the future i18n work.) Quick
 * Settings (the ⚙ top-bar popover) is a shortcut to the handful of these a
 * reader changes mid-session; both write the same account preferences, so they
 * stay in lockstep. Theme delegates to its workspace home; the rest (including
 * the mushaf edition) persist via PreferencesProvider.updateAccount.
 */
export function SettingsScreen() {
  const { preferences, account, updateAccount, updateAccountDebounced } = usePreferences();
  const formatNumber = useNumerals();
  // Confirm before making the experimental tafssir mode the account default.
  const [confirmTafssirDefault, setConfirmTafssirDefault] = useState(false);
  const { state, actions } = useWorkspace();
  const transparency = useTransparency();

  const edition = state.edition;
  const compactReader = useCompactReader();
  const readerMode = resolveReaderMode(preferences.reader_layout, compactReader);

  return (
    <div className="qb-settings">
      <div className="qb-settings-h">
        <div className="kicker">{t("الإعدادات")}</div>
        <h2>{t("التفضيلات")}</h2>
        <div className="sub">
          {t("كلّ الإعدادات هنا. زرّ «العرض» في شريط القراءة اختصارٌ لطريقة القراءة وحجم الخطّ أثناء القراءة، ويحفظ في المكان نفسه.")}
        </div>
      </div>

      <div className="qb-settings-grid">

        <section className="qb-setting-card">
          <h3>{t("القراءة والمصحف")}</h3>
          <p className="card-sub">{t("المصحف، تخطيط الصفحة، وحجم الخطّ.")}</p>
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
          <div className="qb-setting-row">
            <label>{t("طريقة القراءة")}</label>
            <div className="qb-setting-seg qb-fit-choice" data-autofit="2" role="group" aria-label={t("طريقة القراءة")}>
              {READER_MODES.map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  className={readerMode === item.mode ? "active" : ""}
                  aria-pressed={readerMode === item.mode}
                  title={item.hint}
                  onClick={() => void updateAccount({ reader_layout: item.layout })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="qb-setting-row">
            <label>
              {t("حجم خطّ الآية")} <span className="qb-setting-value">{formatNumber(preferences.font_size)}</span>
            </label>
            <input
              type="range"
              className="qb-setting-slider"
              min={18}
              max={48}
              value={preferences.font_size}
              onChange={(event) => updateAccountDebounced({ font_size: Number(event.target.value) })}
            />
          </div>
        </section>

        <TranslationsSettings />

        <DownloadsSettings />

        <AccountSettings />

        <section className="qb-setting-card">
          <h3>{t("العرض")}</h3>
          <p className="card-sub">{t("اللغة والسمة والشفافية وطريقة عرض الأرقام في الواجهة.")}</p>
          <div className="qb-setting-row">
            <label>
              {t("لغة الواجهة")} <span className="en-hint">· Language</span>
            </label>
            <LanguageSelect />
          </div>
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
            <label>{t("الشفافية")}</label>
            <div className="qb-setting-seg qb-fit-choice" data-autofit="2">
              <button
                type="button"
                className={transparency === "auto" ? "active" : ""}
                aria-pressed={transparency === "auto"}
                onClick={() => setTransparency("auto")}
              >
                {t("زجاجية")}
              </button>
              <button
                type="button"
                className={transparency === "reduced" ? "active" : ""}
                aria-pressed={transparency === "reduced"}
                onClick={() => setTransparency("reduced")}
              >
                {t("مُعتِمة")}
              </button>
            </div>
          </div>
          <p className="card-sub fine">{t("«مُعتِمة» تُلغي التمويه خلف الأشرطة واللوحات: أوضح للقراءة وأخفّ على الأجهزة المتواضعة. تُحفظ لهذا الجهاز.")}</p>
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
          <h3>{t("البحث الموجَّه")}</h3>
          <p className="card-sub">{t("الوضع الافتراضي وعُمق القراءة في الدراسة.")}</p>
          <div className="qb-setting-row">
            <label>{t("الوضع الافتراضي")}</label>
            <div className="qb-setting-seg qb-fit-choice" data-autofit="2">
              <button
                type="button"
                className={account.research.default_mode === "strict" ? "active" : ""}
                aria-pressed={account.research.default_mode === "strict"}
                onClick={() => void updateAccount({ research: { default_mode: "strict" } })}
              >
                {t("القرآن وحدَه")}
              </button>
              <button
                type="button"
                className={account.research.default_mode === "tafssir" ? "active copper" : ""}
                aria-pressed={account.research.default_mode === "tafssir"}
                onClick={() => {
                  if (account.research.default_mode === "tafssir") return;
                  setConfirmTafssirDefault(true);
                }}
              >
                {t("تفسيرية")}
              </button>
            </div>
          </div>
          {confirmTafssirDefault ? (
            <div className="qb-setting-confirm" role="alertdialog" aria-label={t("تأكيد الوضع الافتراضي")}>
              <p>
                {t("الوضع التفسيري")} <strong>{t("تجريبي")}</strong>{t(": قراءة بشرية مُولَّدة من نموذج لغوي، ليست حُجَّة شرعية. هل تجعله الوضع الافتراضي؟")}
              </p>
              <div className="qb-setting-confirm-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    void updateAccount({ research: { default_mode: "tafssir" } });
                    setConfirmTafssirDefault(false);
                  }}
                >
                  {t("تأكيد")}
                </button>
                <button type="button" onClick={() => setConfirmTafssirDefault(false)}>
                  {t("إلغاء")}
                </button>
              </div>
            </div>
          ) : null}
          <div className="qb-setting-row">
            <label>{t("عُمق القراءة التفسيرية")}</label>
            <div className="qb-setting-seg qb-fit-choice" data-autofit="2">
              {DEPTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={account.research.depth === option.value ? "active" : ""}
                  aria-pressed={account.research.depth === option.value}
                  onClick={() => void updateAccount({ research: { depth: option.value } })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

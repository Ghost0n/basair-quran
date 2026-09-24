"use client";

import { useState } from "react";

import "./settings.css";

import type { NumeralScript } from "@q-basair/shared";

import { SelectMenu } from "@/components/select-menu";
import { AccountSettings } from "@/features/identity/account-settings";
import { MUSHAF_EDITIONS, resolveEdition } from "@/lib/mushaf-defaults";
import { READER_MODES, resolveReaderMode } from "@/features/reading/reader-modes";
import { useCompactReader } from "@/features/reading/use-wide-screen";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { useWorkspace } from "@/features/shell/workspace-context";

const NUMERAL_OPTIONS: { value: NumeralScript; label: string }[] = [
  { value: "arabic-indic", label: "هنديّة ٠١٢" },
  { value: "latin", label: "لاتينية 012" },
  { value: "persian", label: "فارسيّة ۰۱۲" },
];

const DEPTH_OPTIONS: { value: "fast" | "balanced" | "deep"; label: string }[] = [
  { value: "fast", label: "سريع" },
  { value: "balanced", label: "متوازن" },
  { value: "deep", label: "عميق" },
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

  const edition = state.edition;
  const compactReader = useCompactReader();
  const readerMode = resolveReaderMode(preferences.reader_layout, compactReader);

  return (
    <div className="qb-settings">
      <div className="qb-settings-h">
        <div className="kicker">الإعدادات</div>
        <h2>التفضيلات</h2>
        <div className="sub">
          كلّ الإعدادات هنا. زرّ «العرض» في شريط القراءة اختصارٌ لطريقة القراءة وحجم الخطّ أثناء
          القراءة، ويحفظ في المكان نفسه.
        </div>
      </div>

      <div className="qb-settings-grid">

        <section className="qb-setting-card">
          <h3>القراءة والمصحف</h3>
          <p className="card-sub">المصحف، تخطيط الصفحة، وحجم الخطّ.</p>
          <div className="qb-setting-row">
            <label>المصحف</label>
            <SelectMenu
              className="qb-setting-menu"
              ariaLabel="المصحف"
              value={edition.id}
              options={MUSHAF_EDITIONS.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(next) => void updateAccount({ mushaf_edition: resolveEdition(next).id })}
            />
          </div>
          <p className="card-sub">{edition.description}</p>
          <div className="qb-setting-row">
            <label>طريقة القراءة</label>
            <div className="qb-setting-seg" role="group" aria-label="طريقة القراءة">
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
              حجم خطّ الآية <span className="qb-setting-value">{formatNumber(preferences.font_size)}</span>
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

        <AccountSettings />

        <section className="qb-setting-card">
          <h3>العرض</h3>
          <p className="card-sub">السمة وطريقة عرض الأرقام في الواجهة.</p>
          <div className="qb-setting-row">
            <label>السمة</label>
            <div className="qb-setting-seg">
              <button
                type="button"
                className={state.theme === "dark" ? "active" : ""}
                aria-pressed={state.theme === "dark"}
                onClick={() => state.theme !== "dark" && actions.toggleTheme()}
              >
                داكنة
              </button>
              <button
                type="button"
                className={state.theme === "light" ? "active" : ""}
                aria-pressed={state.theme === "light"}
                onClick={() => state.theme !== "light" && actions.toggleTheme()}
              >
                فاتحة
              </button>
            </div>
          </div>
          <div className="qb-setting-row">
            <label>الأرقام</label>
            <div className="qb-setting-seg">
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
          <h3>البحث الموجَّه</h3>
          <p className="card-sub">الوضع الافتراضي وعُمق القراءة في الدراسة.</p>
          <div className="qb-setting-row">
            <label>الوضع الافتراضي</label>
            <div className="qb-setting-seg">
              <button
                type="button"
                className={account.research.default_mode === "strict" ? "active" : ""}
                aria-pressed={account.research.default_mode === "strict"}
                onClick={() => void updateAccount({ research: { default_mode: "strict" } })}
              >
                القرآن وحدَه
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
                تفسيرية
              </button>
            </div>
          </div>
          {confirmTafssirDefault ? (
            <div className="qb-setting-confirm" role="alertdialog" aria-label="تأكيد الوضع الافتراضي">
              <p>
                الوضع التفسيري <strong>تجريبي</strong>: قراءة بشرية مُولَّدة من نموذج لغوي، ليست حُجَّة
                شرعية. هل تجعله الوضع الافتراضي؟
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
                  تأكيد
                </button>
                <button type="button" onClick={() => setConfirmTafssirDefault(false)}>
                  إلغاء
                </button>
              </div>
            </div>
          ) : null}
          <div className="qb-setting-row">
            <label>عُمق القراءة التفسيرية</label>
            <div className="qb-setting-seg">
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

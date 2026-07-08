"use client";

import { useState } from "react";

import "./settings.css";

import type { NumeralScript, ReaderLayout } from "@q-basair/shared";

import { SelectMenu } from "@/components/select-menu";
import { AccountSettings } from "@/features/identity/account-settings";
import { usePreferences } from "@/lib/preferences-context";
import { useWorkspace } from "@/features/shell/workspace-context";

const NUMERAL_OPTIONS: { value: NumeralScript; label: string }[] = [
  { value: "arabic-indic", label: "هنديّة ٠١٢" },
  { value: "latin", label: "لاتينية 012" },
  { value: "persian", label: "فارسيّة ۰۱۲" },
];

const RENDER_OPTIONS: { value: "authentic" | "simple"; label: string }[] = [
  { value: "authentic", label: "مدني (تخطيط الصفحة)" },
  { value: "simple", label: "نصّي" },
];

// Reader layout (orthogonal to the renderer). "صفحتان" (spread) needs the
// authentic Madani glyph page (Ḥafṣ only), so it's gated on mushaf_render.
const LAYOUT_OPTIONS: { value: ReaderLayout; label: string; authenticOnly?: boolean }[] = [
  { value: "auto", label: "تلقائي" },
  { value: "single", label: "صفحة" },
  { value: "spread", label: "صفحتان", authenticOnly: true },
  { value: "scroll", label: "تمرير" },
  { value: "ayah", label: "آية آية" },
];

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "tr", label: "Türkçe" },
  { value: "id", label: "Bahasa" },
  { value: "ur", label: "اردو" },
];

const DEPTH_OPTIONS: { value: "fast" | "balanced" | "deep"; label: string }[] = [
  { value: "fast", label: "سريع" },
  { value: "balanced", label: "متوازن" },
  { value: "deep", label: "عميق" },
];

/**
 * Settings — the CANONICAL home for every preference: account & session,
 * reading & muṣḥaf, display, guided research, and interface language. Quick
 * Settings (the ⚙ top-bar popover) is a shortcut to the handful of these a
 * reader changes mid-session; both write the same account preferences, so they
 * stay in lockstep. Riwāyah and theme delegate to their existing workspace
 * homes; the rest persist via PreferencesProvider.updateAccount.
 */
export function SettingsScreen() {
  const { preferences, account, updateAccount, updateAccountDebounced } = usePreferences();
  // Confirm before making the experimental tafssir mode the account default.
  const [confirmTafssirDefault, setConfirmTafssirDefault] = useState(false);
  const { state, actions } = useWorkspace();

  // "صفحتان" (spread) only renders on the authentic Madani glyph page, served
  // for Ḥafṣ alone — gate it on both the renderer and the riwāyah name.
  const selectedMushafName =
    state.mushafs.find((item) => item.id === state.selectedMushaf)?.name ??
    state.selectedMushafLabel ??
    "";
  const spreadAvailable = preferences.mushaf_render === "authentic" && selectedMushafName.includes("حفص");

  return (
    <div className="qb-settings">
      <div className="qb-settings-h">
        <div className="kicker">الإعدادات · SETTINGS</div>
        <h2>التفضيلات</h2>
        <div className="sub">
          كلّ الإعدادات هنا. «الإعدادات السريعة» (زرّ ⚙ أعلى الشاشة) اختصارٌ لأكثرها استعمالاً أثناء
          القراءة، وتُحفظ في المكان نفسه.
        </div>
      </div>

      <div className="qb-settings-grid">
        <AccountSettings />

        <section className="qb-setting-card">
          <h3>القراءة والمصحف</h3>
          <p className="card-sub">الرواية، نمط العرض، تخطيط الصفحة، وحجم الخطّ.</p>
          <div className="qb-setting-row">
            <label>الرواية</label>
            <SelectMenu
              className="qb-setting-menu"
              ariaLabel="الرواية"
              value={String(state.selectedMushaf)}
              options={state.mushafs.map((mushafItem) => ({
                value: String(mushafItem.id),
                label: mushafItem.name,
              }))}
              onChange={(next) => actions.setSelectedMushaf(Number(next))}
            />
          </div>
          <div className="qb-setting-row">
            <label>نمط المصحف</label>
            <div className="qb-setting-seg">
              {RENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={preferences.mushaf_render === option.value ? "active" : ""}
                  aria-pressed={preferences.mushaf_render === option.value}
                  onClick={() => void updateAccount({ mushaf_render: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="qb-setting-row">
            <label>تخطيط الصفحة</label>
            <div className="qb-setting-seg is-grid" role="group" aria-label="تخطيط الصفحة">
              {LAYOUT_OPTIONS.map((option) => {
                const disabled = Boolean(option.authenticOnly) && !spreadAvailable;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={preferences.reader_layout === option.value ? "active" : ""}
                    disabled={disabled}
                    aria-pressed={preferences.reader_layout === option.value}
                    title={disabled ? "متاح في النمط المدني (حفص) فقط" : option.label}
                    onClick={() => void updateAccount({ reader_layout: option.value })}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="qb-setting-row">
            <label>
              حجم خطّ الآية <span className="qb-setting-value">{preferences.font_size}px</span>
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
          <p className="card-sub">
            «مدني» يعرض صفحة المصحف بخطّ المدينة (رواية حفص فقط)؛ «نصّي» يعرض النصّ المتدفّق. «صفحتان»
            متاح في النمط المدني (حفص) فقط.
          </p>
        </section>

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

        <section className="qb-setting-card">
          <h3>اللغة</h3>
          <p className="card-sub">لغة واجهة الاستخدام.</p>
          <div className="qb-setting-row">
            <label>لغة الواجهة</label>
            <SelectMenu
              className="qb-setting-menu"
              ariaLabel="لغة الواجهة"
              value={account.ui_language}
              options={LANGUAGE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.value === "ar" ? option.label : `${option.label} — قريباً`,
              }))}
              onChange={(next) => void updateAccount({ ui_language: next })}
            />
          </div>
          <div className="qb-settings-note">
            القرآن الكريم لا يُترجَم. تغيير اللغة يُبدّل واجهة الاستخدام فقط؛ نصّ الآيات يبقى بالعربية دائماً.
            (ترجمة الواجهة الكاملة قيد الإعداد.)
          </div>
        </section>
      </div>
    </div>
  );
}

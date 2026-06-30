"use client";

import "./settings.css";

import type { NumeralScript } from "@q-basair/shared";

import { SelectMenu } from "@/components/select-menu";
import { usePreferences } from "@/lib/preferences-context";
import { useWorkspace } from "@/features/shell/workspace-context";

const NUMERAL_OPTIONS: { value: NumeralScript; label: string }[] = [
  { value: "arabic-indic", label: "هنديّة ٠١٢" },
  { value: "latin", label: "لاتينية 012" },
  { value: "persian", label: "فارسيّة ۰۱۲" },
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
 * Settings — centralized account preferences. Riwāyah and theme delegate
 * to their existing homes (workspace state / TopBar toggle); the rest
 * persist to the backend via PreferencesProvider.updateAccount.
 */
export function SettingsScreen() {
  const { account, updateAccount } = usePreferences();
  const { state, actions } = useWorkspace();

  return (
    <div className="qb-settings">
      <div className="qb-settings-h">
        <div className="kicker">الإعدادات · SETTINGS</div>
        <h2>التفضيلات</h2>
        <div className="sub">تُحفظ هذه الإعدادات كقيَم افتراضية لحسابك.</div>
      </div>

      <div className="qb-settings-grid">
        <section className="qb-setting-card">
          <h3>المصحف والرواية</h3>
          <p className="card-sub">الرواية المعتمدة في القراءة والبحث.</p>
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
            <label>
              حجم خطّ الآية <span className="qb-setting-value">{account.font_size}px</span>
            </label>
            <input
              type="range"
              className="qb-setting-slider"
              min={18}
              max={48}
              value={account.font_size}
              onChange={(event) => void updateAccount({ font_size: Number(event.target.value) })}
            />
          </div>
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
                onClick={() => state.theme !== "dark" && actions.toggleTheme()}
              >
                داكنة
              </button>
              <button
                type="button"
                className={state.theme === "light" ? "active" : ""}
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
                  className={account.numerals === option.value ? "active" : ""}
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
                onClick={() => void updateAccount({ research: { default_mode: "strict" } })}
              >
                القرآن وحدَه
              </button>
              <button
                type="button"
                className={account.research.default_mode === "tafssir" ? "active copper" : ""}
                onClick={() => void updateAccount({ research: { default_mode: "tafssir" } })}
              >
                تفسيرية
              </button>
            </div>
          </div>
          <div className="qb-setting-row">
            <label>عُمق القراءة التفسيرية</label>
            <div className="qb-setting-seg">
              {DEPTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={account.research.depth === option.value ? "active" : ""}
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

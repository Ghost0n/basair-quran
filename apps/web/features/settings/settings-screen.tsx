"use client";

import "./settings.css";

import { SelectMenu } from "@/components/select-menu";
import { AccountSettings } from "@/features/identity/account-settings";
import { usePreferences } from "@/lib/preferences-context";

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
 * Settings — account-level configuration: profile & devices, research defaults,
 * and interface language. Reading/display preferences (theme, riwāyah, mushaf
 * render, page layout, font size, numerals) live ONLY in Quick Settings (the ⚙
 * popover) so they're adjustable during reading — no duplication here.
 */
export function SettingsScreen() {
  const { account, updateAccount } = usePreferences();

  return (
    <div className="qb-settings">
      <div className="qb-settings-h">
        <div className="kicker">الإعدادات · SETTINGS</div>
        <h2>التفضيلات</h2>
        <div className="sub">تُحفظ هذه الإعدادات كقيَم افتراضية لحسابك.</div>
      </div>

      <div className="qb-settings-grid">
        <AccountSettings />

        <section className="qb-setting-card">
          <h3>القراءة والعرض</h3>
          <p className="card-sub">
            السِّمة، الرواية، نمط المصحف، تخطيط الصفحة، حجم الخطّ، والأرقام — كلّها في «الإعدادات
            السريعة» (زرّ ⚙ أعلى الشاشة) لتغييرها أثناء القراءة مباشرةً، دون تكرار هنا.
          </p>
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

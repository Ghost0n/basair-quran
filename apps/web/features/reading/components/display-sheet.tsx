"use client";

import type { NumeralScript, ReaderLayout } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useWorkspace } from "@/features/shell/workspace-context";
import { setShowHighlights, useShowHighlights } from "@/features/themes/ayah-marks";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { useDialog } from "@/lib/use-dialog";

import { READER_MODES, resolveReaderMode } from "../reader-modes";
import { useCompactReader } from "../use-wide-screen";

import { t } from "@/lib/i18n";

const NUMERAL_OPTIONS: { value: NumeralScript; label: string }[] = [
  { value: "arabic-indic", label: "٠١٢" },
  { value: "latin", label: "012" },
  { value: "persian", label: "۰۱۲" },
];

const FONT_MIN = 18;
const FONT_MAX = 48;

/**
 * «العرض» — how the mushaf is shown: layout (three modes), text size, theme,
 * numerals. The reader's own display controls (formerly the top-bar Quick
 * Settings popover + the header layout switcher). All values are account
 * preferences, so Settings shows the same state.
 */
export function DisplaySheet({ onClose }: { onClose: () => void }) {
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const { preferences, updateAccount, updateAccountDebounced } = usePreferences();
  const { state, actions } = useWorkspace();
  const formatNumber = useNumerals();
  const compact = useCompactReader();
  const mode = resolveReaderMode(preferences.reader_layout, compact);
  const dark = state.theme !== "light";
  const showHighlights = useShowHighlights();

  function setLayout(layout: ReaderLayout) {
    void updateAccount({ reader_layout: layout });
  }

  return (
    <div className="qb-rsheet qb-display-sheet" role="dialog" aria-modal="true" aria-label={t("العرض")}>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2>{t("العرض")}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="body">
          <section>
            <div className="label">{t("طريقة القراءة")}</div>
            <div className="modes" role="group" aria-label={t("طريقة القراءة (Shift+M)")}>
              {READER_MODES.map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  className={mode === item.mode ? "active" : ""}
                  aria-pressed={mode === item.mode}
                  onClick={() => setLayout(item.layout)}
                >
                  <Icon name={item.icon} size={20} />
                  <span className="t">{item.label}</span>
                  <span className="d">{item.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="label">
              {t("حجم الخطّ")} <span className="value">{formatNumber(preferences.font_size)}</span>
            </div>
            <div className="size-row">
              <button
                type="button"
                className="step"
                aria-label={t("تصغير الخطّ")}
                disabled={preferences.font_size <= FONT_MIN}
                onClick={() => updateAccountDebounced({ font_size: Math.max(FONT_MIN, preferences.font_size - 2) })}
              >
                ا
              </button>
              <input
                type="range"
                min={FONT_MIN}
                max={FONT_MAX}
                step={1}
                value={preferences.font_size}
                aria-label={t("حجم خطّ الآيات")}
                onChange={(event) => updateAccountDebounced({ font_size: Number(event.target.value) })}
              />
              <button
                type="button"
                className="step big"
                aria-label={t("تكبير الخطّ")}
                disabled={preferences.font_size >= FONT_MAX}
                onClick={() => updateAccountDebounced({ font_size: Math.min(FONT_MAX, preferences.font_size + 2) })}
              >
                ا
              </button>
            </div>
          </section>

          <section className="split">
            <div>
              <div className="label">{t("السِّمة")}</div>
              <div className="seg qb-fit-choice" data-autofit="2" role="group" aria-label={t("السِّمة")}>
                <button type="button" className={dark ? "active" : ""} aria-pressed={dark} onClick={() => !dark && actions.toggleTheme()}>
                  <Icon name="moon" size={15} /> {t("داكنة")}
                </button>
                <button type="button" className={!dark ? "active" : ""} aria-pressed={!dark} onClick={() => dark && actions.toggleTheme()}>
                  <Icon name="sun" size={15} /> {t("فاتحة")}
                </button>
              </div>
            </div>
            <div>
              <div className="label">{t("الأرقام")}</div>
              <div className="seg qb-fit-choice" data-autofit="2" role="group" aria-label={t("الأرقام")}>
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

          <section>
            <div className="label">{t("تظليل المواضيع")}</div>
            <div className="seg qb-fit-choice" data-autofit="2" role="group" aria-label={t("تظليل المواضيع")}>
              <button type="button" className={showHighlights ? "active" : ""} aria-pressed={showHighlights} onClick={() => setShowHighlights(true)}>
                <Icon name="highlight" size={15} /> {t("ظاهر")}
              </button>
              <button type="button" className={!showHighlights ? "active" : ""} aria-pressed={!showHighlights} onClick={() => setShowHighlights(false)}>
                {t("مخفيّ")}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

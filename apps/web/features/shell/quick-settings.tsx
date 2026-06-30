"use client";

import { useEffect, useRef, useState } from "react";

import type { NumeralScript } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { usePreferences } from "@/lib/preferences-context";

import { useWorkspace } from "./workspace-context";

const NUMERAL_OPTIONS: { value: NumeralScript; label: string }[] = [
  { value: "arabic-indic", label: "٠١٢" },
  { value: "latin", label: "012" },
  { value: "persian", label: "۰۱۲" },
];

/**
 * Quick Settings — one top-bar popover that centralizes the controls a reader
 * changes often: theme, riwāyah, ayah font size, and numerals. These write
 * straight to the account preferences (no separate session-overrides concept).
 * Full preferences (language, defaults, …) still live in the Settings screen.
 */
export function QuickSettings() {
  const [open, setOpen] = useState(false);
  const { preferences, updateAccount } = usePreferences();
  const { state, actions } = useWorkspace();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="qb-quick" ref={rootRef}>
      <button
        type="button"
        className={`qb-icon-btn${open ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="إعدادات سريعة"
        aria-label="إعدادات سريعة"
      >
        <Icon name="sliders" size={18} />
      </button>

      {open ? (
        <div className="qb-quick-panel" role="dialog" aria-label="إعدادات سريعة">
          <div className="qb-quick-head">إعدادات سريعة</div>

          <div className="qb-tweak-section">
            <div className="qb-tweak-label">السمة</div>
            <div className="qb-tweak-seg">
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

          <div className="qb-tweak-section">
            <div className="qb-tweak-label">الرواية</div>
            <SelectMenu
              className="qb-quick-menu"
              ariaLabel="الرواية"
              value={String(state.selectedMushaf)}
              placeholder={state.loadingMushafs ? "جارٍ التحميل…" : "الرواية"}
              disabled={state.loadingMushafs}
              options={state.mushafs.map((mushafItem) => ({
                value: String(mushafItem.id),
                label: mushafItem.name,
              }))}
              onChange={(next) => actions.setSelectedMushaf(Number(next))}
            />
          </div>

          <div className="qb-tweak-section">
            <div className="qb-tweak-label">
              حجم خطّ الآية <span className="v">{preferences.font_size}px</span>
            </div>
            <input
              type="range"
              className="qb-tweak-slider"
              min={18}
              max={48}
              value={preferences.font_size}
              onChange={(event) => void updateAccount({ font_size: Number(event.target.value) })}
            />
          </div>

          <div className="qb-tweak-section">
            <div className="qb-tweak-label">الأرقام</div>
            <div className="qb-tweak-seg">
              {NUMERAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={preferences.numerals === option.value ? "active" : ""}
                  onClick={() => void updateAccount({ numerals: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import type { NumeralScript, ReaderLayout } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { usePreferences } from "@/lib/preferences-context";

import { useWorkspace } from "./workspace-context";

const NUMERAL_OPTIONS: { value: NumeralScript; label: string }[] = [
  { value: "arabic-indic", label: "٠١٢" },
  { value: "latin", label: "012" },
  { value: "persian", label: "۰۱۲" },
];

// Reader layout. "صفحتان" (spread) needs an authentic (glyph-page) edition.
const LAYOUT_OPTIONS: { value: ReaderLayout; label: string; authenticOnly?: boolean }[] = [
  { value: "auto", label: "تلقائي" },
  { value: "single", label: "صفحة" },
  { value: "spread", label: "صفحتان", authenticOnly: true },
  { value: "scroll", label: "تمرير" },
  { value: "ayah", label: "آية آية" },
];

/**
 * Quick Settings — one top-bar popover that centralizes the controls a reader
 * changes often: page layout, ayah font size, and numerals. The mushaf edition
 * is a general setting and lives in the Settings screen. These write
 * straight to the account preferences (no separate session-overrides concept).
 * Full preferences (language, defaults, …) still live in the Settings screen.
 */
export function QuickSettings() {
  const [open, setOpen] = useState(false);
  const { preferences, updateAccount } = usePreferences();
  const { state } = useWorkspace();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const spreadAvailable = state.edition.authentic;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        // A SelectMenu renders its list in a portal on <body>, so a click on
        // an option is "outside" rootRef — don't close for those.
        if (target instanceof Element && target.closest(".qb-select-list")) return;
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
            <div className="qb-tweak-label">تخطيط الصفحة</div>
            <div className="qb-tweak-seg is-grid" role="group" aria-label="تخطيط الصفحة">
              {LAYOUT_OPTIONS.map((option) => {
                const disabled = Boolean(option.authenticOnly) && !spreadAvailable;
                const active = preferences.reader_layout === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={active ? "active" : ""}
                    disabled={disabled}
                    aria-pressed={active && !disabled}
                    title={option.label}
                    onClick={() => void updateAccount({ reader_layout: option.value })}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
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
            <div className="qb-tweak-seg" role="group" aria-label="الأرقام">
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
        </div>
      ) : null}
    </div>
  );
}

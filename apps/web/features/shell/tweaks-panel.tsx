"use client";

import { useState } from "react";

import type { NumeralScript } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { usePreferences } from "@/lib/preferences-context";

import { useWorkspace } from "./workspace-context";

const NUMERAL_OPTIONS: { value: NumeralScript; label: string }[] = [
  { value: "arabic-indic", label: "٠١٢" },
  { value: "latin", label: "012" },
  { value: "persian", label: "۰۱۲" },
];

/**
 * Tweaks panel — floating per-session overrides. Changes apply only to
 * this session via the Tweaks layer; "اجعلها افتراضاً" promotes them to
 * the persisted account defaults.
 *
 * Phase 7 covers riwāyah, font size, and numerals. Mushaf font and
 * reciter selection are deferred (font catalogue / Recitation room).
 * Theme keeps its existing TopBar toggle.
 */
export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const { preferences, tweaks, setTweak, resetTweaks, promoteTweaks } = usePreferences();
  const { state, actions } = useWorkspace();

  if (!open) {
    return (
      <button
        type="button"
        className="qb-tweaks-fab"
        onClick={() => setOpen(true)}
        title="تعديلات الجلسة"
        aria-label="تعديلات الجلسة"
      >
        <Icon name="settings" size={20} />
      </button>
    );
  }

  const hasTweaks = Object.keys(tweaks).length > 0;

  return (
    <div className="qb-tweaks-panel" role="dialog" aria-label="تعديلات الجلسة">
      <div className="qb-tweaks-head">
        <span className="t">
          <Icon name="settings" size={15} /> هذه الجلسة
        </span>
        <button type="button" className="x" onClick={() => setOpen(false)} aria-label="إغلاق">
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="qb-tweaks-body">
        <div className="qb-tweak-section">
          <div className="qb-tweak-label">الرواية</div>
          <select
            className="qb-tweak-select"
            value={state.selectedMushaf}
            onChange={(event) => actions.setSelectedMushaf(Number(event.target.value))}
          >
            {state.mushafs.map((mushafItem) => (
              <option key={mushafItem.id} value={mushafItem.id}>
                {mushafItem.name}
              </option>
            ))}
          </select>
        </div>

        <div className="qb-tweak-section">
          <div className="qb-tweak-label">
            حجم الخطّ <span className="v">{preferences.font_size}px</span>
          </div>
          <input
            type="range"
            className="qb-tweak-slider"
            min={18}
            max={48}
            value={preferences.font_size}
            onChange={(event) => setTweak({ font_size: Number(event.target.value) })}
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
                onClick={() => setTweak({ numerals: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="qb-tweaks-foot">
        <button type="button" onClick={resetTweaks} disabled={!hasTweaks}>
          إعادة
        </button>
        <button type="button" className="primary" onClick={() => void promoteTweaks()} disabled={!hasTweaks}>
          اجعلها افتراضاً
        </button>
      </div>
    </div>
  );
}

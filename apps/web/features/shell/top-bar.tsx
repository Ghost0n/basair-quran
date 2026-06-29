"use client";

import { useState } from "react";

import { Icon } from "@/components/icon";

import { CommandBar } from "./command-bar";
import { useShellMode, type ShellMode } from "./mode-context";
import { ThemeToggle } from "./theme-toggle";
import { useWorkspace } from "./workspace-context";

const MODE_CRUMB: Record<ShellMode, string> = {
  reading: "القراءة",
  search: "البحث",
  studio: "الدراسة",
  notebook: "الدفتر",
  bookmarks: "المحفوظات",
  history: "السجلّ",
  roots: "جذور متابعة",
  audio: "التلاوة",
  settings: "إعدادات",
  heatmap: "خريطة الجذر",
};

export function TopBar() {
  const { mode, setMode } = useShellMode();
  const { state, actions } = useWorkspace();
  const [shareCopied, setShareCopied] = useState(false);

  async function copyDeepLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      /* clipboard blocked (insecure context / denied) — silently no-op */
    }
  }

  return (
    <div className="qb-topbar">
      <div className="qb-crumbs">
        <Icon name="mosque" size={14} />
        <span>المصحف</span>
        <span className="dot" />
        <span className="qb-crumb-current">{MODE_CRUMB[mode]}</span>
      </div>

      <CommandBar />

      <div className="qb-top-actions">
        <select
          className="qb-riwayah-select"
          value={state.selectedMushaf}
          onChange={(event) => actions.setSelectedMushaf(Number(event.target.value))}
          disabled={state.loadingMushafs}
          aria-label="اختيار الرواية"
          title="الرواية"
        >
          {state.loadingMushafs ? <option value={state.selectedMushaf}>جارٍ التحميل…</option> : null}
          {state.mushafs.map((mushafItem) => (
            <option key={mushafItem.id} value={mushafItem.id}>
              {mushafItem.name}
            </option>
          ))}
        </select>
        <ThemeToggle />
        <button
          type="button"
          className="qb-icon-btn"
          title={shareCopied ? "تم نسخ الرابط" : "نسخ رابط هذه الصفحة"}
          aria-label={shareCopied ? "تم نسخ الرابط" : "نسخ رابط هذه الصفحة"}
          onClick={() => void copyDeepLink()}
        >
          <Icon name={shareCopied ? "check" : "share"} size={18} />
        </button>
        <button
          type="button"
          className="qb-icon-btn gold"
          title="ابدأ جلسة بحث"
          aria-label="ابدأ جلسة بحث"
          aria-pressed={mode === "studio"}
          onClick={() => setMode("studio")}
        >
          <Icon name="sparkles" size={18} />
        </button>
      </div>
    </div>
  );
}

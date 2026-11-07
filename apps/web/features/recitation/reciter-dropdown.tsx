"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/icon";
import { canHover } from "@/lib/can-hover";
import { useKeepOnScreen } from "@/lib/keep-on-screen";

import { useRecitation } from "./recitation-context";

import { t } from "@/lib/i18n";

/**
 * ReciterDropdown — the reciter picker, now an upward-opening dropdown attached
 * to the play bar (replacing the old bottom sheet). The trigger is the bar's
 * reciter chip; the panel floats ABOVE it (the bar is pinned to the bottom of
 * the screen) with a filterable list of the 50+ reciters.
 */
export function ReciterDropdown({ subtitle }: { subtitle?: ReactNode }) {
  const recitation = useRecitation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useKeepOnScreen(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
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

  const q = query.trim().toLowerCase();
  const filtered = q
    ? recitation.reciters.filter(
        (item) => item.name.includes(query.trim()) || item.name_english.toLowerCase().includes(q),
      )
    : recitation.reciters;

  return (
    <div className="qb-reciter-dd" ref={rootRef}>
      <button
        type="button"
        className={`qb-media-reciter${open ? " open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("اختيار القارئ")}
      >
        <span className="avatar">
          <Icon name={recitation.isPlaying ? "volume" : "user"} size={14} />
        </span>
        <span className="txt">
          <span className="name">{recitation.reciter?.name ?? t("اختر قارئاً")}</span>
          {subtitle ? <span className="ref">{subtitle}</span> : null}
        </span>
        <Icon name="chevUp" size={14} />
      </button>

      {open ? (
        <div className="qb-reciter-dd-panel" ref={panelRef} role="listbox" aria-label={t("القرّاء")}>
          <input
            type="text"
            className="qb-reciter-dd-search"
            placeholder={t("ابحث عن قارئ…")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("ابحث عن قارئ")}
            autoFocus={canHover()}
          />
          <div className="qb-reciter-dd-list">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === recitation.reciterId}
                className={`qb-reciter-dd-row${item.id === recitation.reciterId ? " active" : ""}`}
                onClick={() => {
                  recitation.setReciter(item.id);
                  setOpen(false);
                }}
              >
                <span className="avatar">
                  <Icon
                    name={item.id === recitation.reciterId && recitation.isPlaying ? "volume" : "user"}
                    size={16}
                  />
                </span>
                <span className="info">
                  <span className="name">{item.name}</span>
                  <span className="meta">
                    {item.name_english} {t("· رواية")} {item.riwayah === "hafs" ? t("حفص") : item.riwayah}
                  </span>
                </span>
              </button>
            ))}
            {filtered.length === 0 ? <div className="qb-reciter-dd-empty">{t("لا نتائج مطابقة.")}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

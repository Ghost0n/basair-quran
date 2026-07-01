"use client";

import { useState } from "react";

import { Icon } from "@/components/icon";

import { useRecitation } from "./recitation-context";

/**
 * ReciterSheet — a bottom sheet opened from the media bar (or the rail) for
 * browsing and picking a reciter. Filters the 50+ reciters by name. Replaces
 * the reciter column of the retired recitation screen.
 */
export function ReciterSheet() {
  const recitation = useRecitation();
  const [query, setQuery] = useState("");

  if (!recitation.sheetOpen) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? recitation.reciters.filter(
        (item) =>
          item.name.includes(query.trim()) || item.name_english.toLowerCase().includes(q),
      )
    : recitation.reciters;

  return (
    <div className="qb-reciter-backdrop" onClick={recitation.closeSheet}>
      <div
        className="qb-reciter-sheet"
        role="dialog"
        aria-label="اختيار القارئ"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="qb-reciter-sheet-head">
          <div className="kicker">القرّاء · RECITERS</div>
          <button type="button" className="x" onClick={recitation.closeSheet} aria-label="إغلاق">
            <Icon name="close" size={16} />
          </button>
        </div>
        <input
          type="text"
          className="qb-reciter-search"
          placeholder="ابحث عن قارئ…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="ابحث عن قارئ"
          autoFocus
        />
        <div className="qb-reciter-sheet-list">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`qb-reciter-row${item.id === recitation.reciterId ? " active" : ""}`}
              onClick={() => {
                recitation.setReciter(item.id);
                recitation.closeSheet();
              }}
            >
              <span className="avatar">
                <Icon
                  name={item.id === recitation.reciterId && recitation.isPlaying ? "volume" : "user"}
                  size={18}
                />
              </span>
              <span className="info">
                <span className="name">{item.name}</span>
                <span className="meta">
                  {item.name_english} · رواية {item.riwayah === "hafs" ? "حفص" : item.riwayah}
                </span>
              </span>
            </button>
          ))}
          {filtered.length === 0 ? <div className="qb-reciter-empty">لا نتائج مطابقة.</div> : null}
        </div>
      </div>
    </div>
  );
}

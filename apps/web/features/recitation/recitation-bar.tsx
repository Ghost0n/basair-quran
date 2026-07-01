"use client";

import "./recitation.css";

import type { KeyboardEvent, MouseEvent } from "react";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";

import { RECITATION_SPEEDS, useRecitation } from "./recitation-context";
import { ReciterSheet } from "./reciter-sheet";

/**
 * RecitationBar — the persistent bottom media bar, global across every screen.
 * Shows the current reciter + ayah, transport (prev / play-pause / next), a
 * seekable progress track, and speed/repeat controls. The reciter chip opens
 * the ReciterSheet. Rendered as a fixed-height slice of the shell so the reader
 * area recomputes above it (no overlap). Hidden until a recitation starts.
 *
 * The sheet is always rendered (it self-hides) so it can be opened from the rail
 * even before any ayah has played.
 */
export function RecitationBar() {
  const recitation = useRecitation();
  const formatNumber = useNumerals();
  const { current, reciter } = recitation;

  // Seek by clicking (or arrowing) along the track. RTL: the fill grows from the
  // inline-start (right) edge, so ratio 0 is the right edge, 1 the left.
  function seekFromPointer(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    recitation.seek((rect.right - event.clientX) / rect.width);
  }

  function seekFromKey(event: KeyboardEvent<HTMLDivElement>) {
    // In RTL, ArrowLeft advances (toward the end of the fill), ArrowRight rewinds.
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      recitation.seek(Math.min(1, recitation.progress + 0.05));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      recitation.seek(Math.max(0, recitation.progress - 0.05));
    }
  }

  function cycleSpeed() {
    const index = RECITATION_SPEEDS.indexOf(recitation.speed);
    recitation.setSpeed(RECITATION_SPEEDS[(index + 1) % RECITATION_SPEEDS.length]);
  }

  const progressPct = Math.round(recitation.progress * 100);

  return (
    <>
      {current ? (
        <div className="qb-media-bar" role="region" aria-label="شريط التلاوة">
          <div className="qb-media-transport">
            <button type="button" className="nav" onClick={recitation.prev} aria-label="الآية السابقة">
              <Icon name="chevRight" size={18} />
            </button>
            <button
              type="button"
              className="play"
              onClick={recitation.toggle}
              aria-label={recitation.isPlaying ? "إيقاف" : "تشغيل"}
            >
              <Icon name={recitation.isPlaying ? "pause" : "play"} size={20} />
            </button>
            <button type="button" className="nav" onClick={recitation.next} aria-label="الآية التالية">
              <Icon name="chevLeft" size={18} />
            </button>
          </div>

          <div className="qb-media-main">
            <button
              type="button"
              className="qb-media-reciter"
              onClick={recitation.openSheet}
              aria-haspopup="dialog"
              aria-label="تغيير القارئ"
            >
              <span className="avatar">
                <Icon name={recitation.isPlaying ? "volume" : "user"} size={14} />
              </span>
              <span className="txt">
                <span className="name">{reciter?.name ?? "التلاوة"}</span>
                <span className="ref">
                  سورة {formatNumber(current.surah)} · آية {formatNumber(current.ayah)}
                </span>
              </span>
            </button>

            <div
              className="qb-media-seek"
              role="slider"
              tabIndex={0}
              aria-label="موضع التلاوة"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              onClick={seekFromPointer}
              onKeyDown={seekFromKey}
            >
              <span className="fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="qb-media-tools">
            <button
              type="button"
              className={`chip${recitation.repeatAyah ? " active" : ""}`}
              onClick={recitation.toggleRepeat}
              aria-pressed={recitation.repeatAyah}
              title="تكرار الآية"
            >
              تكرار
            </button>
            <button type="button" className="chip" onClick={cycleSpeed} title="سرعة التلاوة">
              {recitation.speed}×
            </button>
            <button type="button" className="chip icon" onClick={recitation.stop} aria-label="إيقاف التلاوة" title="إيقاف">
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>
      ) : null}

      <ReciterSheet />
    </>
  );
}

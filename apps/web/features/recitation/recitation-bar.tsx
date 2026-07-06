"use client";

import "./recitation.css";

import type { KeyboardEvent, MouseEvent } from "react";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";

import { ReciterDropdown } from "./reciter-dropdown";
import { RECITATION_SPEEDS, useRecitation } from "./recitation-context";

/**
 * RecitationBar — the persistent bottom media bar, global across every screen.
 * Shows the reciter (an upward dropdown to switch) + the current ayah, transport
 * (prev / play-pause / next), a seekable progress track, and speed/repeat
 * controls. Rendered as a fixed-height slice of the shell so the reader area
 * recomputes above it (no overlap).
 *
 * Two visibilities: PLAYING (a `current` ayah is loaded) and IDLE (opened from
 * the reader footer to pick a reciter before playing — `idle`, no `current`).
 * Transport that needs a loaded ayah is disabled while idle; the play button
 * starts the pending ayah.
 */
export function RecitationBar() {
  const recitation = useRecitation();
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const { current } = recitation;

  // Riwāyah mismatch: the audio (reciter's riwāyah) won't match the displayed
  // text when the reader is on a different riwāyah's mushaf.
  const reciterRiwayah = recitation.reciter?.riwayah;
  const readerRiwayah = recitation.mushafs.find((m) => m.id === mushaf.pageData?.mushaf_id)?.riwayah;
  const riwayahMismatch = Boolean(
    reciterRiwayah && readerRiwayah && reciterRiwayah !== readerRiwayah,
  );

  // Seek by clicking (or arrowing) along the track. RTL: the fill grows from the
  // inline-start (right) edge, so ratio 0 is the right edge, 1 the left.
  function seekFromPointer(event: MouseEvent<HTMLDivElement>) {
    if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    recitation.seek((rect.right - event.clientX) / rect.width);
  }

  function seekFromKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!current) return;
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

  if (!current && !recitation.idle) return null;

  const progressPct = Math.round(recitation.progress * 100);
  const canPlay = Boolean(current) || Boolean(recitation.pendingStart);

  return (
    <div className="qb-media-bar" role="region" aria-label="شريط التلاوة">
      <div className="qb-media-transport">
        <button
          type="button"
          className="nav"
          onClick={recitation.prev}
          disabled={!current}
          aria-label="الآية السابقة"
        >
          <Icon name="chevRight" size={18} />
        </button>
        <button
          type="button"
          className="play"
          onClick={current ? recitation.toggle : recitation.startPending}
          disabled={!canPlay}
          aria-label={recitation.isPlaying ? "إيقاف" : "تشغيل"}
        >
          <Icon name={recitation.isPlaying ? "pause" : "play"} size={20} />
        </button>
        <button
          type="button"
          className="nav"
          onClick={recitation.next}
          disabled={!current}
          aria-label="الآية التالية"
        >
          <Icon name="chevLeft" size={18} />
        </button>
      </div>

      <div className="qb-media-main">
        <ReciterDropdown
          subtitle={
            current ? (
              <>
                سورة {formatNumber(current.surah)} · آية {formatNumber(current.ayah)}
              </>
            ) : (
              "جاهز — اختر قارئاً ثم شغّل"
            )
          }
        />

        {riwayahMismatch ? (
          <div className="qb-media-riwayah-warn" role="note">
            <Icon name="alert" size={12} />
            رواية القارئ تختلف عن رواية المصحف المعروض
          </div>
        ) : null}

        <div
          className={`qb-media-seek${current ? "" : " is-idle"}`}
          role="slider"
          tabIndex={current ? 0 : -1}
          aria-label="موضع التلاوة"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-disabled={!current}
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
        <button
          type="button"
          className="chip icon"
          onClick={recitation.stop}
          aria-label="إغلاق شريط التلاوة"
          title="إغلاق"
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}

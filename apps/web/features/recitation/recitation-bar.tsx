"use client";

import "./recitation.css";

import type { KeyboardEvent, MouseEvent } from "react";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";

import { RangePicker } from "./range-picker";
import { ReciterDropdown } from "./reciter-dropdown";
import { RECITATION_SPEEDS, useRecitation } from "./recitation-context";

import { t } from "@/lib/i18n";

/** 0:07 · 12:45 · 1:02:09 — in the interface's digits. */
function clock(seconds: number, formatNumber: (value: number) => string): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  const text = hours ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
  return text.replace(/\d/g, (digit) => formatNumber(Number(digit)));
}

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

  // The track is the whole surah. It always runs right-to-left (like the
  // mushaf, in every interface language): ratio 0 at the right edge, 1 at the
  // left; a click lands on the right verse at the right moment.
  function seekFromPointer(event: MouseEvent<HTMLDivElement>) {
    if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    recitation.seekSurah((rect.right - event.clientX) / rect.width);
  }

  function seekFromKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!current) return;
    // Right-to-left track: ArrowLeft moves forward 5 s, ArrowRight back 5 s.
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      recitation.seekBy(5);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      recitation.seekBy(-5);
    }
  }

  function cycleSpeed() {
    const index = RECITATION_SPEEDS.indexOf(recitation.speed);
    recitation.setSpeed(RECITATION_SPEEDS[(index + 1) % RECITATION_SPEEDS.length]);
  }

  // A verse heard on its own (a search result's ▶) opens no bar.
  if (!recitation.active) return null;

  const timing = recitation.surahTiming;
  const progressPct = timing ? Math.round(timing.progress * 1000) / 10 : 0;
  const elapsedText = timing ? clock(timing.elapsed, formatNumber) : clock(0, formatNumber);
  const totalText = timing && timing.total > 0 ? `${timing.exact ? "" : "~"}${clock(timing.total, formatNumber)}` : "--:--";
  const canPlay = Boolean(current) || Boolean(recitation.pendingStart);

  return (
    <div className="qb-media-bar" role="region" aria-label={t("شريط التلاوة")}>
      <div className="qb-media-transport">
        <button
          type="button"
          className="nav"
          onClick={recitation.prev}
          disabled={!current}
          aria-label={t("الآية السابقة")}
        >
          <Icon name="chevRight" size={18} />
        </button>
        <button
          type="button"
          className="play"
          onClick={current ? recitation.toggle : recitation.startPending}
          disabled={!canPlay}
          aria-label={recitation.isPlaying ? t("إيقاف") : t("تشغيل")}
        >
          <Icon name={recitation.isPlaying ? "pause" : "play"} size={20} />
        </button>
        <button
          type="button"
          className="nav"
          onClick={recitation.next}
          disabled={!current}
          aria-label={t("الآية التالية")}
        >
          <Icon name="chevLeft" size={18} />
        </button>
      </div>

      <div className="qb-media-main">
        <ReciterDropdown
          subtitle={
            current ? (
              <>
                {t("سورة")} {recitation.surahs.find((item) => item.id === current.surah)?.name ?? formatNumber(current.surah)}
                {t("، آية")} {formatNumber(current.ayah)}
              </>
            ) : (
              t("جاهز — اختر قارئاً ثم شغّل")
            )
          }
        />

        {riwayahMismatch ? (
          <div className="qb-media-riwayah-warn" role="note">
            <Icon name="alert" size={12} />
            {t("رواية القارئ تختلف عن رواية المصحف المعروض")}
          </div>
        ) : null}

        <div className="qb-media-progress">
          <span className="time">{elapsedText}</span>
          <div
            className={`qb-media-seek${current ? "" : " is-idle"}`}
            role="slider"
            tabIndex={current ? 0 : -1}
            aria-label={t("موضع التلاوة")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
            aria-valuetext={`${elapsedText} / ${totalText}`}
            aria-disabled={!current}
            onClick={seekFromPointer}
            onKeyDown={seekFromKey}
          >
            <span className="fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="time total">{totalText}</span>
        </div>
      </div>

      <div className="qb-media-tools">
        <RangePicker />
        <button
          type="button"
          className={`chip${recitation.repeatAyah ? " active" : ""}`}
          onClick={recitation.toggleRepeat}
          aria-pressed={recitation.repeatAyah}
          title={t("تكرار الآية")}
        >
          {t("تكرار")}
        </button>
        <button type="button" className="chip" onClick={cycleSpeed} title={t("سرعة التلاوة")}>
          {recitation.speed}×
        </button>
        <button
          type="button"
          className="chip icon"
          onClick={recitation.stop}
          aria-label={t("إغلاق شريط التلاوة")}
          title={t("إغلاق")}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}

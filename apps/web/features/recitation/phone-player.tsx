"use client";

import "./phone-player.css";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/icon";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useNumerals } from "@/lib/preferences-context";

import { useRecitation } from "./recitation-context";
import { RecitationSheet } from "./recitation-sheet";
import { useRevealed } from "./session-view";

import { t } from "@/lib/i18n";

const HINT_KEY = "qb.recitation.clearHint";

/** 0:07 · 12:45 · 1:02:09 — in the interface's digits. */
export function clock(seconds: number, formatNumber: (value: number) => string): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  const text = hours ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
  return text.replace(/\d/g, (digit) => formatNumber(Number(digit)));
}

export function riwayahName(key: string | undefined): string {
  return !key || key === "hafs" ? t("حفص") : key;
}

/** What the player names: the verse, the reciter, and whether the reciter's riwāyah differs from the mushaf's. */
export function useNowPlaying() {
  const recitation = useRecitation();
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const position = recitation.current ?? recitation.pendingStart;
  const surah = position ? recitation.surahs.find((item) => item.id === position.surah)?.name ?? formatNumber(position.surah) : null;
  const where = position && surah ? t("{0} · آية {1}", { 0: surah, 1: formatNumber(position.ayah) }) : t("اختر ما تتلو");
  const reciter = recitation.reciter;
  const readerRiwayah = recitation.mushafs.find((item) => item.id === mushaf.pageData?.mushaf_id)?.riwayah;
  const mismatch = Boolean(reciter?.riwayah && readerRiwayah && reciter.riwayah !== readerRiwayah);
  const who = reciter
    ? reciter.riwayah && reciter.riwayah !== "hafs"
      ? `${reciter.name} · ${t("رواية {0}", { 0: riwayahName(reciter.riwayah) })}`
      : reciter.name
    : t("اختر قارئاً");
  return { position, surah, where, who, mismatch };
}

/** The surah's progress line: drag or tap anywhere (it always runs right to left, like the mushaf). */
export function SeekLine() {
  const recitation = useRecitation();
  const formatNumber = useNumerals();
  const [drag, setDrag] = useState<number | null>(null);
  const timing = recitation.surahTiming;
  const enabled = Boolean(recitation.current);
  const ratio = drag ?? timing?.progress ?? 0;
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10;
  const elapsed = clock(timing?.elapsed ?? 0, formatNumber);
  const total = timing && timing.total > 0 ? `${timing.exact ? "" : "~"}${clock(timing.total, formatNumber)}` : "--:--";

  const at = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return rect.width > 0 ? Math.min(1, Math.max(0, (rect.right - event.clientX) / rect.width)) : 0;
  };
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!enabled) return;
    // Right-to-left track: ArrowLeft moves forward 5 s, ArrowRight back 5 s.
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      recitation.seekBy(event.key === "ArrowLeft" ? 5 : -5);
    }
  }

  return (
    <div className="qb-pprog">
      <span className="time">{elapsed}</span>
      <div
        className={`qb-pseek${enabled ? "" : " is-idle"}`}
        role="slider"
        tabIndex={enabled ? 0 : -1}
        aria-label={t("موضع التلاوة")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${elapsed} / ${total}`}
        aria-disabled={!enabled}
        onPointerDown={(event) => {
          if (!enabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag(at(event));
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setDrag(at(event));
        }}
        onPointerUp={(event) => {
          if (drag === null) return;
          recitation.seekSurah(at(event));
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKey}
      >
        <span className="rail" />
        <span className="fill" style={{ width: `${pct}%` }} />
        <span className="knob" style={{ insetInlineStart: `${pct}%` }} />
      </div>
      <span className="time total">{total}</span>
    </div>
  );
}

/** Previous verse · play / pause · next verse (verse order runs right to left). */
export function Transport({ big = false }: { big?: boolean }) {
  const recitation = useRecitation();
  const { current } = recitation;
  const canPlay = Boolean(current) || Boolean(recitation.pendingStart);
  return (
    <div className={`qb-ptransport${big ? " big" : ""}`}>
      <button type="button" className="nav" onClick={recitation.prev} disabled={!current} aria-label={t("الآية السابقة")}>
        <Icon name="chevRight" size={big ? 18 : 16} />
      </button>
      <button
        type="button"
        className="play"
        onClick={current ? recitation.toggle : recitation.startPending}
        disabled={!canPlay}
        aria-label={recitation.isPlaying ? t("إيقاف") : t("تشغيل")}
      >
        <Icon name={recitation.isPlaying ? "pause" : "play"} size={big ? 26 : 20} />
      </button>
      <button type="button" className="nav" onClick={recitation.next} disabled={!current} aria-label={t("الآية التالية")}>
        <Icon name="chevLeft" size={big ? 18 : 16} />
      </button>
    </div>
  );
}

/**
 * The phone's recitation controls (either orientation, lib/use-phone-layout.ts;
 * desktop keeps RecitationBar):
 *
 *  - the PLAYER, two rows at the bottom of the clear view: transport, the verse
 *    and reciter (tap: the recitation sheet), settings and close; then the
 *    surah's progress line with its times. On its side the phone has little
 *    height: the same controls sit in one row, the progress line in the middle;
 *  - the CAPSULE under the status bar when the view is revealed or on another
 *    screen: play / pause and the verse with a thin progress line (tap: the sheet).
 *
 * Which one shows is CSS (html.qb-reciting / .qb-recite-revealed, session-view.ts).
 */
export function PhonePlayer() {
  const recitation = useRecitation();
  const { mode } = useShellMode();
  const revealed = useRevealed();
  const now = useNowPlaying();
  const [sheetOpen, setSheetOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const [hint, setHint] = useState(false);

  const custom = recitation.repeatMode !== "off" || recitation.speed !== 1;
  const progressPct = Math.round((recitation.surahTiming?.progress ?? 0) * 1000) / 10;

  // The first time the clear view hides the bars, say once how to bring them back.
  const clear = recitation.active && mode === "reading" && !revealed;
  useEffect(() => {
    if (!clear) {
      setHint(false);
      return;
    }
    try {
      if (window.localStorage.getItem(HINT_KEY)) return;
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      return;
    }
    const show = window.setTimeout(() => setHint(true), 500);
    const hide = window.setTimeout(() => setHint(false), 3600);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [clear]);

  // The session ended (closed from elsewhere): no sheet left behind.
  useEffect(() => {
    if (!recitation.active) setSheetOpen(false);
  }, [recitation.active]);

  if (!recitation.active) return null;

  const open = (event: { currentTarget: HTMLElement }) => {
    openerRef.current = event.currentTarget;
    setSheetOpen(true);
  };

  return (
    <>
      <div className="qb-pplayer" role="region" aria-label={t("شريط التلاوة")}>
        <div className="row">
          <Transport />
          <button
            type="button"
            className="now"
            onClick={open}
            aria-haspopup="dialog"
            aria-label={t("{0}، {1}. إعدادات التلاوة", { 0: now.where, 1: now.who })}
          >
            <span className="where">{now.where}</span>
            <span className="who">{now.who}</span>
          </button>
          <div className="side">
            <button type="button" className="qb-picon setbtn" onClick={open} aria-haspopup="dialog" aria-label={t("إعدادات التلاوة")}>
              <Icon name="sliders" size={19} />
              {now.mismatch || custom ? <span className={`dot${now.mismatch ? " warn" : ""}`} /> : null}
            </button>
            <button type="button" className="qb-picon" onClick={recitation.stop} aria-label={t("إنهاء التلاوة")}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
        <SeekLine />
      </div>

      <div className="qb-capsule" role="group" aria-label={t("التلاوة الجارية")}>
        <button
          type="button"
          className="cplay"
          onClick={recitation.current ? recitation.toggle : recitation.startPending}
          disabled={!recitation.current && !recitation.pendingStart}
          aria-label={recitation.isPlaying ? t("إيقاف") : t("تشغيل")}
        >
          <Icon name={recitation.isPlaying ? "pause" : "play"} size={16} />
        </button>
        <button type="button" className="cbody" onClick={open} aria-haspopup="dialog" aria-label={t("{0}. افتح التلاوة", { 0: now.where })}>
          <span className="ctext">
            <b>{now.where}</b>
            <span className="cbar">
              <span style={{ width: `${progressPct}%` }} />
            </span>
          </span>
          <Icon name="chevDown" size={14} />
        </button>
      </div>

      <div className={`qb-recite-hint${hint ? " show" : ""}`} role="status">
        {hint ? t("اضغط على الصفحة لإظهار التنقل") : null}
      </div>

      {sheetOpen && typeof document !== "undefined"
        ? createPortal(
            <RecitationSheet
              onClose={() => {
                setSheetOpen(false);
                openerRef.current?.focus({ preventScroll: true });
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

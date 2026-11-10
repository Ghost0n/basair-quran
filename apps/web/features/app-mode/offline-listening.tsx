"use client";

import { useEffect, useState } from "react";

import type { ReciterItem } from "@q-basair/shared";

import { FULL_QURAN, rangeOnDevice } from "@/lib/app-mode/audio-ranges";
import { startRangeDownload, stopReciterDownload, useAudioJob } from "@/lib/app-mode/audio-jobs";
import { APP_MODE } from "@/lib/app-mode/config";
import { useNumerals } from "@/lib/preferences-context";
import { sameVerse, type VerseRange } from "@/lib/quran-ranges";
import { reciterName } from "@/features/recitation/reciter-catalogue";
import { t } from "@/lib/i18n";

import "./app-mode.css";

export type OfflineChoice = { key: string; label: string; range: VerseRange | null; detail?: string };

const sameRange = (a: VerseRange | null | undefined, b: VerseRange | null | undefined) =>
  Boolean(a && b && sameVerse(a.start, b.start) && sameVerse(a.end, b.end));

/**
 * «للاستماع دون اتصال» (the recitation sheet, standalone app only): the
 * reciter being listened to, for the chosen range, the page, the surah, the
 * juz or the whole Quran — downloaded on demand and played from the device
 * afterwards (lib/app-mode/audio-ranges.ts). The download runs on while the
 * reader goes elsewhere; stopping keeps what arrived. Settings → «التنزيلات»
 * lists and removes them. Renders nothing on the web.
 */
export function OfflineListening({ reciter, choices }: { reciter: ReciterItem | null; choices: OfflineChoice[] }) {
  if (!APP_MODE || !reciter) return null;
  return <Choices reciter={reciter} choices={[...choices, { key: "quran", label: t("المصحف كاملاً"), range: FULL_QURAN }]} />;
}

function Choices({ reciter, choices }: { reciter: ReciterItem; choices: OfflineChoice[] }) {
  const formatNumber = useNumerals();
  const job = useAudioJob();
  const running = job?.status === "running";
  const [onDevice, setOnDevice] = useState<Record<string, { done: number; total: number }>>({});
  const target = { id: reciter.id, audio_base: reciter.audio_base, surahs: reciter.surahs };

  // What is on the device for each choice: read again as a download moves on or ends.
  const progressKey = `${job?.status}:${Math.floor((job?.done ?? 0) / 25)}`;
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      choices.map(async (choice) => [choice.key, choice.range ? await rangeOnDevice(target, choice.range) : null] as const),
    ).then((entries) => {
      if (cancelled) return;
      setOnDevice(Object.fromEntries(entries.filter((entry): entry is [string, { done: number; total: number }] => Boolean(entry[1]))));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciter.id, progressKey, choices.map((choice) => choice.key).join()]);

  return (
    <div className="qb-offline-listening">
      <p className="qb-offline-note">
        {t("تُنزَّل تلاوة {0} على جهازك، فتستمع إليها دون اتصال.", { 0: reciterName(reciter) })}
      </p>
      {choices.map((choice) => {
        const status = onDevice[choice.key];
        const mine = job && job.reciterId === reciter.id && sameRange(job.range, choice.range) ? job : null;
        const percent = mine && mine.total ? Math.round((mine.done / mine.total) * 100) : 0;
        const complete = Boolean(status && status.total > 0 && status.done >= status.total);
        const started = Boolean(status && status.done > 0);
        const unavailable = Boolean(status && status.total === 0);
        return (
          <div key={choice.key} className="qb-download-row">
            <div className="name">
              <div>{choice.label}</div>
              <div className="meta">
                {[
                  choice.detail,
                  unavailable
                    ? t("غير متاحة لهذا القارئ")
                    : complete
                      ? t("على الجهاز")
                      : status && started
                        ? t("{0}٪ على الجهاز", { 0: formatNumber(Math.floor((status.done / status.total) * 100)) })
                        : null,
                  mine?.status === "running" && mine.surah ? t("سورة {0}", { 0: formatNumber(mine.surah) }) : null,
                ]
                  .filter(Boolean)
                  .map((part, index) => (
                    <span key={index}>
                      {index ? " · " : null}
                      <bdi>{part}</bdi>
                    </span>
                  ))}
              </div>
              {mine?.status === "failed" ? (
                <div className="meta" role="alert">
                  {t("تعذّر التنزيل. تحقّق من الاتصال ثم أعد المحاولة.")}
                </div>
              ) : choice.key === "quran" && !complete && !mine ? (
                <div className="meta">{t("قد تبلغ التلاوة كاملة نحو غيغابايت حسب القارئ؛ يُفضَّل الاتصال بشبكة Wi‑Fi.")}</div>
              ) : null}
            </div>
            {mine?.status === "running" ? (
              <>
                <div className="bar-wrap" role="status" aria-label={`${formatNumber(percent)}%`}>
                  <div className="qb-download-bar">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <button type="button" className="qb-btn ghost sm" onClick={stopReciterDownload}>
                  {t("إيقاف")}
                </button>
              </>
            ) : complete ? null : (
              <button
                type="button"
                className="qb-btn ghost sm"
                disabled={running || unavailable || !choice.range}
                onClick={() => choice.range && void startRangeDownload(target, choice.range)}
              >
                {started ? t("استئناف") : t("تنزيل")}
              </button>
            )}
          </div>
        );
      })}
      <p className="qb-offline-note">{t("تُدار التلاوات المنزّلة وتُحذف من الإعدادات ← التنزيلات.")}</p>
    </div>
  );
}

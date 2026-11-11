"use client";

import "@/features/reading/reading.css";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { useMushaf } from "@/features/reading/mushaf-context";
import { canHover } from "@/lib/can-hover";
import { useNumerals } from "@/lib/preferences-context";
import { ayahCount, customRange, divisionOf, divisionRange, sameVerse, type VersePosition, type VerseRange } from "@/lib/quran-ranges";
import { useDialog } from "@/lib/use-dialog";

import { riwayahName, SeekLine, Transport, useNowPlaying } from "./phone-player";
import { VerseField } from "./range-picker";
import { OfflineListening, type OfflineChoice } from "@/features/app-mode/offline-listening";
import { APP_MODE } from "@/lib/app-mode/config";

import { RECITATION_SPEEDS, useRecitation, type RepeatMode } from "./recitation-context";
import { pickReciters, reciterName } from "./reciter-catalogue";
import { RiwayahChips, useReciterMeta } from "./reciter-chips";

import { t } from "@/lib/i18n";

type Scope = "page" | "surah" | "juz" | "custom";
type View = "main" | "reciters" | "custom" | "offline";

const sameRange = (a: VerseRange | null, b: VerseRange | null) =>
  Boolean(a && b && sameVerse(a.start, b.start) && sameVerse(a.end, b.end));

/**
 * The recitation sheet (phones): the full controls on top — the verse, large
 * transport, the surah's progress — then four rows:
 *
 *   reciter          → a searchable list
 *   what to recite   page · surah · juz · custom (tapping one starts it)
 *   repeat           off · the verse · the range
 *   speed
 *
 * and «إنهاء التلاوة». Following the verse in the mushaf and locking the reader
 * tools are not options: a recitation always does both.
 */
export function RecitationSheet({ onClose }: { onClose: () => void }) {
  const recitation = useRecitation();
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const now = useNowPlaying();
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const [view, setView] = useState<View>("main");
  const [query, setQuery] = useState("");

  // Where "here" is: the verse being recited, else the reader's page.
  const pageAyahs = mushaf.pageData?.ayahs ?? [];
  const here: VersePosition =
    now.position ?? (pageAyahs[0] ? { surah: pageAyahs[0].surah_id, ayah: pageAyahs[0].ayah } : { surah: 1, ayah: 1 });
  const pageRange: VerseRange | null = pageAyahs.length
    ? {
        start: { surah: pageAyahs[0].surah_id, ayah: pageAyahs[0].ayah },
        end: { surah: pageAyahs[pageAyahs.length - 1].surah_id, ayah: pageAyahs[pageAyahs.length - 1].ayah },
      }
    : null;
  const ranges: Record<Exclude<Scope, "custom">, VerseRange | null> = {
    page: pageRange,
    surah: divisionRange("surah", here.surah),
    juz: divisionRange("juz", divisionOf("juz", here)),
  };
  const active = recitation.range;
  const scope: Scope | null = !active
    ? null
    : sameRange(active, ranges.page)
      ? "page"
      : sameRange(active, ranges.surah)
        ? "surah"
        : sameRange(active, ranges.juz)
          ? "juz"
          : "custom";

  const surahName = (id: number) => recitation.surahs.find((item) => item.id === id)?.name ?? formatNumber(id);
  // Each reference is direction-isolated so a surah name keeps its number beside it.
  const ref = (p: VersePosition) => `⁨${surahName(p.surah)} ${formatNumber(p.ayah)}⁩`;

  const [from, setFrom] = useState<VersePosition>(here);
  const [to, setTo] = useState<VersePosition>({ surah: here.surah, ayah: ayahCount(here.surah) });
  const surahOptions = useMemo(
    () =>
      Array.from({ length: 114 }, (_, index) => ({
        value: String(index + 1),
        label: `${formatNumber(index + 1)}. ${surahName(index + 1)}`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recitation.surahs, formatNumber],
  );

  function recite(range: VerseRange | null) {
    if (!range) return;
    recitation.playRange(range, { repeat: recitation.repeatMode === "range" });
  }

  const [riwayah, setRiwayah] = useState("all");
  const reciters = pickReciters(recitation.reciters, { query, riwayah, prefer: now.readerRiwayah });
  const reciterMeta = useReciterMeta();

  const title =
    view === "main"
      ? t("التلاوة")
      : view === "reciters"
        ? t("القارئ")
        : view === "offline"
          ? t("للاستماع دون اتصال")
          : t("نطاق مخصّص");
  // What can be downloaded for offline listening (the app; the whole Quran is added there).
  const offlineChoices: OfflineChoice[] = [
    ...(active && scope === "custom"
      ? [{ key: "range", label: t("النطاق المختار"), range: active, detail: t("من {0} إلى {1}", { 0: ref(active.start), 1: ref(active.end) }) }]
      : []),
    ...(pageRange ? [{ key: "page", label: t("الصفحة"), range: pageRange, detail: t("من {0} إلى {1}", { 0: ref(pageRange.start), 1: ref(pageRange.end) }) }] : []),
    { key: "surah", label: t("سورة {0}", { 0: surahName(here.surah) }), range: ranges.surah },
    { key: "juz", label: t("الجزء {0}", { 0: formatNumber(divisionOf("juz", here)) }), range: ranges.juz },
  ];
  const repeatOptions: { value: RepeatMode; label: string }[] = [
    { value: "off", label: t("بلا") },
    { value: "verse", label: t("الآية") },
    { value: "range", label: t("النطاق") },
  ];
  const scopes: { value: Scope; label: string }[] = [
    { value: "page", label: t("الصفحة") },
    { value: "surah", label: t("السورة") },
    { value: "juz", label: t("الجزء") },
    { value: "custom", label: t("مخصّص") },
  ];

  return (
    <div className="qb-rsheet qb-recite-sheet" role="dialog" aria-modal="true" aria-labelledby="qb-recite-sheet-title">
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2 id="qb-recite-sheet-title">{title}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="body">
          {view === "main" ? (
            <>
              <div className="nowblock">
                <div className="snwhere">{now.surah ? t("سورة {0}", { 0: now.where }) : now.where}</div>
                <Transport big />
                <SeekLine />
              </div>

              <div className="setlist">
                <div className="srow">
                  <button type="button" className="recrow" onClick={() => setView("reciters")} aria-haspopup="true">
                    <span className="avatar">
                      <Icon name="user" size={17} />
                    </span>
                    <span className="nm">
                      <b>{recitation.reciter ? reciterName(recitation.reciter) : t("اختر قارئاً")}</b>
                      <small className={now.mismatch ? "warn" : undefined}>
                        {now.mismatch
                          ? t("رواية {0} · تختلف عن المصحف المعروض", { 0: riwayahName(recitation.reciter?.riwayah) })
                          : t("رواية {0}", { 0: riwayahName(recitation.reciter?.riwayah) })}
                      </small>
                      {/* How it sounds: one recording, or verse by verse (a short break between verses). */}
                      {recitation.recording ? (
                        <small className="qb-recite-source" dir="auto">
                          {recitation.recording.continuous ? t("تلاوة متصلة") : t("آية آية")}
                          {recitation.recording.source ? (
                            <>
                              {" · "}
                              <bdi>{recitation.recording.source}</bdi>
                            </>
                          ) : null}
                        </small>
                      ) : null}
                    </span>
                    <Icon name="chevLeft" size={16} />
                  </button>
                </div>

                <div className="srow col">
                  <span className="k">
                    {t("ماذا تتلو؟")}
                    {active ? <small>{t("من {0} إلى {1}", { 0: ref(active.start), 1: ref(active.end) })}</small> : null}
                  </span>
                  <div className="chips" role="group" aria-label={t("ماذا تتلو؟")}>
                    {scopes.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={scope === item.value}
                        disabled={item.value === "page" && !pageRange}
                        onClick={() => {
                          if (item.value === "custom") {
                            setFrom(active?.start ?? here);
                            setTo(active?.end ?? { surah: here.surah, ayah: ayahCount(here.surah) });
                            setView("custom");
                          } else {
                            recite(ranges[item.value]);
                          }
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="srow">
                  <span className="k" id="qb-recite-repeat">
                    {t("التكرار")}
                  </span>
                  <div className="seg" role="group" aria-labelledby="qb-recite-repeat">
                    {repeatOptions.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={recitation.repeatMode === item.value}
                        onClick={() => recitation.setRepeatMode(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="srow">
                  <span className="k" id="qb-recite-speed">
                    {t("السرعة")}
                  </span>
                  <div className="seg" role="group" aria-labelledby="qb-recite-speed">
                    {RECITATION_SPEEDS.map((value) => (
                      <button key={value} type="button" aria-pressed={recitation.speed === value} onClick={() => recitation.setSpeed(value)}>
                        {formatNumber(value)}×
                      </button>
                    ))}
                  </div>
                </div>

                {APP_MODE && recitation.reciter ? (
                  <div className="srow">
                    <button type="button" className="recrow" onClick={() => setView("offline")} aria-haspopup="true">
                      <span className="avatar">
                        <Icon name="download" size={17} />
                      </span>
                      <span className="nm">
                        <b>{t("للاستماع دون اتصال")}</b>
                        <small>{t("نزّل التلاوة على جهازك")}</small>
                      </span>
                      <Icon name="chevLeft" size={16} />
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="endbtn"
                onClick={() => {
                  onClose();
                  recitation.stop();
                }}
              >
                {t("إنهاء التلاوة")}
              </button>
            </>
          ) : null}

          {view === "offline" ? (
            <div className="sv">
              <button type="button" className="backrow" onClick={() => setView("main")}>
                <Icon name="chevRight" size={16} />
                {t("رجوع")}
              </button>
              <OfflineListening reciter={recitation.reciter} choices={offlineChoices} />
            </div>
          ) : null}

          {view === "reciters" ? (
            <div className="sv">
              <button type="button" className="backrow" onClick={() => setView("main")}>
                <Icon name="chevRight" size={16} />
                {t("رجوع")}
              </button>
              <input
                className="search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("ابحث عن قارئ…")}
                aria-label={t("ابحث عن قارئ")}
                autoComplete="off"
                autoFocus={canHover()}
              />
              <RiwayahChips reciters={recitation.reciters} value={riwayah} onChange={setRiwayah} />
              <div className="reciters" role="radiogroup" aria-label={t("القرّاء")}>
                {reciters.length === 0 ? <p className="empty">{t("لا يوجد قارئ بهذا الاسم.")}</p> : null}
                {reciters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    className="rec"
                    aria-checked={item.id === recitation.reciterId}
                    onClick={() => {
                      recitation.setReciter(item.id);
                      window.setTimeout(() => setView("main"), 160);
                    }}
                  >
                    <span className="avatar">
                      <Icon name="user" size={16} />
                    </span>
                    <span className="nm">
                      <b>{reciterName(item)}</b>
                      <small>{reciterMeta(item)}</small>
                    </span>
                    <span className="tick">
                      <Icon name="check" size={18} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {view === "custom" ? (
            <div className="sv">
              <button type="button" className="backrow" onClick={() => setView("main")}>
                <Icon name="chevRight" size={16} />
                {t("رجوع")}
              </button>
              <VerseField label={t("من")} value={from} onChange={setFrom} surahOptions={surahOptions} />
              <VerseField label={t("إلى")} value={to} onChange={setTo} surahOptions={surahOptions} />
              <button
                type="button"
                className="go"
                onClick={() => {
                  recite(customRange(from, to));
                  setView("main");
                }}
              >
                <Icon name="play" size={15} />
                {t("تلاوة")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

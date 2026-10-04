"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useNumerals } from "@/lib/preferences-context";
import {
  ayahCount,
  customRange,
  DIVISION_COUNT,
  divisionOf,
  divisionRange,
  type VersePosition,
  type VerseRange,
} from "@/lib/quran-ranges";

import { useRecitation } from "./recitation-context";

import { t } from "@/lib/i18n";

type Scope = "page" | "surah" | "juz" | "hizb" | "custom";

const SCOPES: { scope: Scope; label: () => string }[] = [
  { scope: "page", label: () => t("الصفحة") },
  { scope: "surah", label: () => t("السورة") },
  { scope: "juz", label: () => t("الجزء") },
  { scope: "hizb", label: () => t("الحزب") },
  { scope: "custom", label: () => t("مخصّص") },
];

/**
 * «نطاق التلاوة» — what to recite: the page on screen, a surah, a juz, a hizb,
 * or a custom from → to. The range stops at its end (or loops with «تكرار
 * النطاق»). The same popover holds «متابعة»: the reader highlights the recited
 * verse and turns pages with it. Opens upward from the media bar.
 */
export function RangePicker() {
  const recitation = useRecitation();
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The panel is portaled to <body>: inside the media bar (itself a blurred
  // glass) its backdrop blur could only see the bar, and the verses behind it
  // stayed sharp. At the page level it frosts the page into a soft glow.
  const [place, setPlace] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const locate = () => {
      const chip = rootRef.current?.getBoundingClientRect();
      if (!chip) return;
      const width = Math.min(380, window.innerWidth - 24);
      const bar = rootRef.current?.closest(".qb-media-bar")?.getBoundingClientRect() ?? chip;
      const phone = window.innerWidth <= 768;
      const left = phone
        ? Math.max(12, bar.left)
        : Math.min(Math.max(12, chip.right - width), window.innerWidth - width - 12);
      setPlace({
        position: "fixed",
        left,
        width: phone ? Math.min(window.innerWidth - 24, bar.width) : width,
        bottom: window.innerHeight - bar.top + 10,
      });
    };
    locate();
    window.addEventListener("resize", locate);
    return () => window.removeEventListener("resize", locate);
  }, [open]);

  // Where "here" is: the verse being recited, else the reader's page.
  const pageAyahs = mushaf.pageData?.ayahs ?? [];
  const here: VersePosition = recitation.current ??
    (pageAyahs[0] ? { surah: pageAyahs[0].surah_id, ayah: pageAyahs[0].ayah } : { surah: 1, ayah: 1 });

  const [scope, setScope] = useState<Scope>("surah");
  const [surah, setSurah] = useState(here.surah);
  const [juz, setJuz] = useState(() => divisionOf("juz", here));
  const [hizb, setHizb] = useState(() => divisionOf("hizb", here));
  const [from, setFrom] = useState<VersePosition>(here);
  const [to, setTo] = useState<VersePosition>({ surah: here.surah, ayah: ayahCount(here.surah) });
  const [repeat, setRepeat] = useState(false);

  // Each opening starts from where the reader / recitation is now.
  useEffect(() => {
    if (!open) return;
    setSurah(here.surah);
    setJuz(divisionOf("juz", here));
    setHizb(divisionOf("hizb", here));
    setFrom(here);
    setTo({ surah: here.surah, ayah: ayahCount(here.surah) });
    setRepeat(recitation.range?.repeat ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Element;
      // The surah menus portal their lists to <body>.
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target) || target.closest?.(".qb-select-list")) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pageRange: VerseRange | null = pageAyahs.length
    ? {
        start: { surah: pageAyahs[0].surah_id, ayah: pageAyahs[0].ayah },
        end: { surah: pageAyahs[pageAyahs.length - 1].surah_id, ayah: pageAyahs[pageAyahs.length - 1].ayah },
      }
    : null;

  const chosen: VerseRange | null = useMemo(() => {
    if (scope === "page") return pageRange;
    if (scope === "surah") return divisionRange("surah", surah);
    if (scope === "juz") return divisionRange("juz", juz);
    if (scope === "hizb") return divisionRange("hizb", hizb);
    return customRange(from, to);
  }, [scope, pageRange?.start.surah, pageRange?.start.ayah, pageRange?.end.surah, pageRange?.end.ayah, surah, juz, hizb, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const surahName = (id: number) => recitation.surahs.find((item) => item.id === id)?.name ?? formatNumber(id);
  // Each reference is direction-isolated so an Arabic surah name keeps its
  // number beside it inside a left-to-right sentence (and vice versa).
  const ref = (p: VersePosition) => `\u2068${surahName(p.surah)} ${formatNumber(p.ayah)}\u2069`;
  const surahOptions = Array.from({ length: 114 }, (_, index) => ({
    value: String(index + 1),
    label: `${formatNumber(index + 1)}. ${surahName(index + 1)}`,
  }));
  const numberOptions = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ value: String(index + 1), label: formatNumber(index + 1) }));

  function play() {
    if (!chosen) return;
    recitation.playRange(chosen, { repeat });
    setOpen(false);
  }

  // The chip names the active range.
  const active = recitation.range;
  const chipLabel = active ? `${ref(active.start)} – ${ref(active.end)}` : t("نطاق التلاوة");

  return (
    <div className="qb-range" ref={rootRef}>
      <button
        type="button"
        className={`chip range-chip${active ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("نطاق التلاوة")}
      >
        <Icon name="page" size={14} />
        <span className="lbl">{chipLabel}</span>
      </button>

      {open && place && typeof document !== "undefined" ? createPortal(
        <div className="qb-range-panel" ref={panelRef} style={place} role="dialog" aria-label={t("نطاق التلاوة")}>
          <div className="head">
            <h3>{t("نطاق التلاوة")}</h3>
            <button type="button" className="close" onClick={() => setOpen(false)} aria-label={t("إغلاق")}>
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="seg" role="tablist" aria-label={t("نطاق التلاوة")}>
            {SCOPES.map((item) => (
              <button
                key={item.scope}
                type="button"
                role="tab"
                aria-selected={scope === item.scope}
                className={scope === item.scope ? "active" : ""}
                disabled={item.scope === "page" && !pageRange}
                onClick={() => setScope(item.scope)}
              >
                {item.label()}
              </button>
            ))}
          </div>

          {scope === "surah" || scope === "juz" || scope === "hizb" ? (
            <div className="field">
              <span className="label">{scope === "surah" ? t("السورة") : scope === "juz" ? t("الجزء") : t("الحزب")}</span>
              {scope === "surah" ? (
                <SelectMenu className="qb-range-select" ariaLabel={t("السورة")} value={String(surah)} options={surahOptions} onChange={(value) => setSurah(Number(value))} />
              ) : scope === "juz" ? (
                <SelectMenu className="qb-range-select" ariaLabel={t("الجزء")} value={String(juz)} options={numberOptions(DIVISION_COUNT.juz)} onChange={(value) => setJuz(Number(value))} />
              ) : (
                <SelectMenu className="qb-range-select" ariaLabel={t("الحزب")} value={String(hizb)} options={numberOptions(DIVISION_COUNT.hizb)} onChange={(value) => setHizb(Number(value))} />
              )}
            </div>
          ) : null}
          {scope === "custom" ? (
            <>
              <VerseField label={t("من")} value={from} onChange={setFrom} surahOptions={surahOptions} />
              <VerseField label={t("إلى")} value={to} onChange={setTo} surahOptions={surahOptions} />
            </>
          ) : null}

          {chosen ? <p className="summary">{t("من {0} إلى {1}", { 0: ref(chosen.start), 1: ref(chosen.end) })}</p> : null}

          <div className="opts">
            <button type="button" className={`opt${repeat ? " on" : ""}`} aria-pressed={repeat} onClick={() => setRepeat(!repeat)}>
              <Icon name="repeat" size={15} />
              <span>{t("تكرار النطاق")}</span>
            </button>
            <button
              type="button"
              className={`opt${recitation.follow ? " on" : ""}`}
              aria-pressed={recitation.follow}
              onClick={() => recitation.setFollow(!recitation.follow)}
            >
              <Icon name="book" size={15} />
              <span>{t("متابعة الآية في المصحف")}</span>
            </button>
          </div>

          <button type="button" className="go" onClick={play} disabled={!chosen}>
            <Icon name="play" size={15} /> {t("تلاوة النطاق")}
          </button>
          {active ? (
            <button type="button" className="clear" onClick={() => recitation.clearRange()}>
              {t("إلغاء النطاق")}
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function VerseField({
  label,
  value,
  onChange,
  surahOptions,
}: {
  label: string;
  value: VersePosition;
  onChange: (next: VersePosition) => void;
  surahOptions: { value: string; label: string }[];
}) {
  const max = ayahCount(value.surah);
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="verse-row">
        <SelectMenu
          className="qb-range-select"
          ariaLabel={t("السورة")}
          value={String(value.surah)}
          options={surahOptions}
          onChange={(next) => onChange({ surah: Number(next), ayah: Math.min(value.ayah, ayahCount(Number(next))) })}
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={value.ayah}
          aria-label={t("آية")}
          onChange={(event) => {
            const ayah = Number(event.target.value);
            if (Number.isFinite(ayah)) onChange({ surah: value.surah, ayah: Math.min(Math.max(ayah, 1), max) });
          }}
        />
      </div>
    </div>
  );
}

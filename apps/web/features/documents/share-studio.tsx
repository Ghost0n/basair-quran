"use client";

import "./documents.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ResearchReference } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { useNumerals } from "@/lib/preferences-context";
import { useDialog } from "@/lib/use-dialog";

import { AI_NOTE_LABEL, buildCarousel, clip, plainText, researchMeta, TAFSSIR_BADGE, type ShareableResearch } from "./carousel";
import { PrintSheet } from "./print-sheet";
import {
  SHARE_FORMATS,
  SHARE_STYLES,
  canvasToPng,
  downloadBlob,
  renderShareCanvas,
  shareFiles,
  shareOrDownload,
  type ShareCardInput,
  type ShareFormat,
  type ShareStyle,
} from "./share-card";
import { buildZip } from "./zip";

import { t, tn } from "@/lib/i18n";

export type ShareArtifact = "research" | "verse" | "carousel" | "print";

const ARTIFACTS: { value: ShareArtifact; label: string; icon: "page" | "book" | "cards" | "download" }[] = [
  { value: "research", get label() {
    return t("بطاقة البحث");
  }, icon: "page" },
  { value: "verse", get label() {
    return t("بطاقة آية");
  }, icon: "book" },
  { value: "carousel", get label() {
    return t("سلسلة شرائح");
  }, icon: "cards" },
  { value: "print", get label() {
    return t("طباعة / PDF");
  }, icon: "download" },
];

const PREFS_KEY = "qb.shareStudio";

function readPrefs(): { format: ShareFormat; style: ShareStyle } {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      format: raw.format in SHARE_FORMATS ? raw.format : "portrait",
      style: raw.style in SHARE_STYLES ? raw.style : "night",
    };
  } catch {
    return { format: "portrait", style: "night" };
  }
}

function slug(text: string): string {
  return text.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 48) || "basair";
}

/**
 * «مشاركة» — the research artifacts studio: a research cover card, a verse
 * card (any quoted ayah, optionally with its note), a carousel (cover + one
 * slide per ayah + closing, as a ZIP or a multi-image share) and a print /
 * PDF rendition. Sizes (4:5, square, story) and styles are remembered per
 * device. Everything renders locally on a canvas.
 */
export function ShareStudio({
  research: researchProp,
  references,
  surahName: surahNameProp,
  initial,
  onClose,
}: {
  research: ShareableResearch;
  references?: ResearchReference[];
  surahName: (surahId: number) => string;
  initial?: { artifact?: ShareArtifact; ayahKey?: string };
  onClose: () => void;
}) {
  const formatNumber = useNumerals();
  const panelRef = useDialog<HTMLDivElement>(onClose);
  // Parents pass fresh objects/functions on every render; key the preview on
  // content so it only re-renders when the research (or a surah name) changes.
  const researchKey = JSON.stringify(researchProp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const research = useMemo(() => researchProp, [researchKey]);
  const surahNameRef = useRef(surahNameProp);
  surahNameRef.current = surahNameProp;
  const surahKey = research.sections.flatMap((section) => section.ayahs.map((ref) => surahNameProp(ref.surah_id))).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const surahName = useCallback((surahId: number) => surahNameRef.current(surahId), [surahKey]);
  const [artifact, setArtifact] = useState<ShareArtifact>(initial?.artifact ?? "research");
  const [{ format, style }, setPrefs] = useState(readPrefs);
  const [withNote, setWithNote] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [slide, setSlide] = useState(0);
  const renderId = useRef(0);

  const helpers = useMemo(() => ({ surahName, formatNumber }), [surahName, formatNumber]);

  // Every quoted ayah, with the note of its section (first ayah of a section only).
  const ayahs = useMemo(
    () =>
      research.sections.flatMap((section) =>
        section.ayahs
          .filter((ref) => ref.text)
          .map((ref, index) => ({
            key: `${section.id}:${ref.surah_id}:${ref.ayah}`,
            ref,
            note: index === 0 && section.body ? clip(plainText(section.body), 240) : "",
            ai: section.kind === "ai_answer" || (research.aiSectionIds ?? []).includes(section.id),
          })),
      ),
    [research],
  );
  const [ayahKey, setAyahKey] = useState(initial?.ayahKey ?? ayahs[0]?.key ?? "");
  const chosen = ayahs.find((entry) => entry.key === ayahKey) ?? ayahs[0];

  const cards: ShareCardInput[] = useMemo(() => {
    if (artifact === "carousel") return buildCarousel(research, helpers);
    if (artifact === "verse") {
      if (!chosen) return [];
      return [
        {
          kind: "verse",
          text: chosen.ref.text,
          reference: t("سورة {0}، الآية {1}", { 0: surahName(chosen.ref.surah_id), 1: formatNumber(chosen.ref.ayah) }),
          note: withNote && chosen.note ? chosen.note : null,
          noteLabel: withNote && chosen.note && chosen.ai ? t(AI_NOTE_LABEL) : null,
        },
      ];
    }
    if (artifact === "research") {
      return [
        {
          kind: "research",
          title: research.title || t("بحث"),
          summary: research.summary,
          meta: researchMeta(research, helpers),
          excerpt: ayahs[0]?.ref.text ?? null,
          badge: research.mode === "tafssir" ? t(TAFSSIR_BADGE) : null,
        },
      ];
    }
    return [];
  }, [artifact, research, helpers, chosen, withNote, ayahs, surahName, formatNumber]);

  // Live preview (debounced; a newer render supersedes an older one).
  useEffect(() => {
    if (!cards.length) {
      setPreviews([]);
      return;
    }
    const id = ++renderId.current;
    const timer = window.setTimeout(async () => {
      try {
        const urls: string[] = [];
        for (const card of cards) {
          const canvas = await renderShareCanvas(card, { format, style });
          if (id !== renderId.current) return;
          urls.push(canvas.toDataURL("image/png"));
        }
        setPreviews(urls);
        setSlide((current) => Math.min(current, urls.length - 1));
      } catch {
        if (id === renderId.current) setPreviews([]);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [cards, format, style]);

  function setFormat(next: ShareFormat) {
    setPrefs((current) => {
      const value = { ...current, format: next };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(value));
      } catch {
        /* private mode */
      }
      return value;
    });
  }

  function setStyle(next: ShareStyle) {
    setPrefs((current) => {
      const value = { ...current, style: next };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(value));
      } catch {
        /* private mode */
      }
      return value;
    });
  }

  async function renderAll(): Promise<Blob[]> {
    const blobs: Blob[] = [];
    for (const card of cards) blobs.push(await canvasToPng(await renderShareCanvas(card, { format, style })));
    return blobs;
  }

  function fileName(index: number): string {
    if (artifact === "verse" && chosen) return `basair-${chosen.ref.surah_id}-${chosen.ref.ayah}.png`;
    if (artifact === "carousel") return `${slug(research.title)}-${String(index + 1).padStart(2, "0")}.png`;
    return `${slug(research.title)}.png`;
  }

  async function share() {
    setBusy(true);
    setNote(null);
    try {
      const blobs = await renderAll();
      if (artifact === "carousel") {
        const files = blobs.map((blob, index) => new File([blob], fileName(index), { type: "image/png" }));
        if ((await shareFiles(files, research.title)) === "shared") {
          setNote(t("تمت مشاركة الشرائح."));
          return;
        }
        await downloadZip(blobs);
        return;
      }
      const result = await shareOrDownload(blobs[0], fileName(0), research.title);
      setNote(result === "shared" ? t("تمت المشاركة.") : t("حُفظت الصورة."));
    } catch {
      setNote(t("تعذّر إنشاء الصورة."));
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip(existing?: Blob[]) {
    const blobs = existing ?? (await renderAll());
    const entries = await Promise.all(
      blobs.map(async (blob, index) => ({ name: fileName(index), data: new Uint8Array(await blob.arrayBuffer()) })),
    );
    downloadBlob(new Blob([buildZip(entries)], { type: "application/zip" }), `${slug(research.title)}.zip`);
    setNote(tn("حُفظت {0} شريحة في ملف مضغوط.", entries.length, { 0: formatNumber(entries.length) }));
  }

  async function download() {
    setBusy(true);
    setNote(null);
    try {
      if (artifact === "carousel") await downloadZip();
      else {
        downloadBlob((await renderAll())[0], fileName(0));
        setNote(t("حُفظت الصورة."));
      }
    } catch {
      setNote(t("تعذّر إنشاء الصورة."));
    } finally {
      setBusy(false);
    }
  }

  const ratio = SHARE_FORMATS[format];
  const current = previews[Math.min(slide, previews.length - 1)];

  return createPortal(
    <div className="qb-rsheet qb-share-studio" role="dialog" aria-modal="true" aria-label={t("مشاركة البحث")}>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2>{t("مشاركة البحث")}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="body">
          <div className="kinds" role="radiogroup" aria-label={t("الصيغة")}>
            {ARTIFACTS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="radio"
                aria-checked={artifact === entry.value}
                className={artifact === entry.value ? "on" : ""}
                disabled={entry.value === "verse" && ayahs.length === 0}
                onClick={() => {
                  setArtifact(entry.value);
                  setSlide(0);
                }}
              >
                <Icon name={entry.icon} size={16} />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>

          {artifact === "print" ? (
            <div className="print-pane">
              <p>
                {t("نسخة مطبوعة نظيفة من البحث: العنوان والملخّص والآيات بخطّ المصحف والملاحظات والمراجع")}
                {research.mode === "tafssir" ? t("، مع تنبيه القراءة التفسيرية التجريبية") : ""}{t(". اختر «حفظ بصيغة PDF» في نافذة الطباعة لتحصل على ملف.")}
              </p>
              <button type="button" className="qb-btn primary" onClick={() => setPrinting(true)}>
                <Icon name="download" size={15} /> {t("طباعة / حفظ PDF")}
              </button>
            </div>
          ) : (
            <div className="studio">
              <div className="preview-col">
                <div
                  className={`preview f-${format}`}
                  style={{ aspectRatio: `${ratio.w} / ${ratio.h}` }}
                  aria-live="polite"
                  aria-busy={!current}
                >
                  {current ? <img src={current} alt={t("معاينة الصورة")} /> : <span className="qb-skeleton-page" aria-hidden />}
                </div>
                {artifact === "carousel" && previews.length > 1 ? (
                  <div className="thumbs" role="tablist" aria-label={t("الشرائح")}>
                    {previews.map((url, index) => (
                      <button
                        key={index}
                        type="button"
                        role="tab"
                        aria-selected={index === slide}
                        aria-label={t("الشريحة {0}", { 0: formatNumber(index + 1) })}
                        className={index === slide ? "on" : ""}
                        onClick={() => setSlide(index)}
                      >
                        <img src={url} alt="" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="controls">
                {artifact === "verse" && ayahs.length ? (
                  <div className="group">
                    <div className="label">{t("الآية")}</div>
                    <SelectMenu
                      ariaLabel={t("الآية")}
                      value={chosen?.key ?? ""}
                      options={ayahs.map((entry) => ({
                        value: entry.key,
                        label: `${surahName(entry.ref.surah_id)} ${formatNumber(entry.ref.ayah)} — ${clip(entry.ref.text, 28)}`,
                      }))}
                      onChange={setAyahKey}
                    />
                    {chosen?.note ? (
                      <label className="check">
                        <input type="checkbox" checked={withNote} onChange={(event) => setWithNote(event.target.checked)} />
                        {t("مع ملاحظة القسم")}{chosen.ai ? t(" (موسومة: مولَّدة آلياً)") : ""}
                      </label>
                    ) : null}
                  </div>
                ) : null}

                <div className="group">
                  <div className="label">{t("المقاس")}</div>
                  <div className="qb-segmented qb-fit-track" data-autofit="1" role="radiogroup" aria-label={t("المقاس")}>
                    {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={format === value}
                        className={format === value ? "on" : ""}
                        onClick={() => setFormat(value)}
                      >
                        {SHARE_FORMATS[value].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="group">
                  <div className="label">{t("النمط")}</div>
                  <div className="swatches" role="radiogroup" aria-label={t("النمط")}>
                    {(Object.keys(SHARE_STYLES) as ShareStyle[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={style === value}
                        className={style === value ? "on" : ""}
                        onClick={() => setStyle(value)}
                      >
                        <span
                          className="sw"
                          style={{
                            background: `linear-gradient(160deg, ${SHARE_STYLES[value].bgTop}, ${SHARE_STYLES[value].bgBottom})`,
                            color: SHARE_STYLES[value].gold,
                          }}
                          aria-hidden
                        >
                          ب
                        </span>
                        {SHARE_STYLES[value].label}
                      </button>
                    ))}
                  </div>
                </div>

                {artifact === "carousel" ? (
                  <p className="hint">
                    {t("{0}: غلاف، ثم آية في كل شريحة مع ملاحظة قسمها، ثم خاتمة. تُشارَك معاً أو تُحفظ في ملف مضغوط.", {
                      0: tn("{0} شريحة", previews.length || cards.length, { 0: formatNumber(previews.length || cards.length) }),
                    })}
                  </p>
                ) : null}
                {research.mode === "tafssir" ? (
                  <p className="hint copper">{t("يحمل الغلاف والخاتمة وسم «{0}».", { 0: t(TAFSSIR_BADGE) })}</p>
                ) : null}

                <div className="actions">
                  <button type="button" className="qb-btn primary" onClick={() => void share()} disabled={busy || !cards.length}>
                    <Icon name="share" size={15} /> {artifact === "carousel" ? t("مشاركة الشرائح") : t("مشاركة")}
                  </button>
                  <button type="button" className="qb-btn ghost" onClick={() => void download()} disabled={busy || !cards.length}>
                    <Icon name="download" size={15} /> {artifact === "carousel" ? t("تنزيل ZIP") : t("تنزيل")}
                  </button>
                </div>
                {note ? (
                  <div className="qb-toast-inline" role="status">
                    {note}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
      {printing ? (
        <PrintSheet research={research} references={references} surahName={surahName} onDone={() => setPrinting(false)} />
      ) : null}
    </div>,
    document.body,
  );
}

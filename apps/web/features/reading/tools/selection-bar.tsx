"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { SurahListItem, TextCountResponse, TextCountScopes } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";
import { queueStudioAsk } from "@/lib/studio-prefill";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import { useMorphology } from "../use-morphology";
import { useWebDesign } from "@/lib/use-web-design";
import { useIsMobile } from "@/lib/use-is-mobile";

import { StudyExtras } from "./study-extras";
import "./tools.web.css";

import type { WordSelection } from "./word-selection";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * The «تحديد» tool's action bar: what to do with the selected words — exact
 * search, root search (one word), ask the Studio (AI), count (the phrase and
 * each letter in the page / surah / whole Quran), or copy with its reference.
 */
export function SelectionBar({
  selection,
  surahs,
  mushafId,
  onClear,
}: {
  selection: WordSelection;
  surahs: SurahListItem[];
  mushafId: number;
  onClear: () => void;
}) {
  const formatNumber = useNumerals();
  const { mode, setMode } = useShellMode();
  const { actions } = useWorkspace();
  const [counting, setCounting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rootBusy, setRootBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Web design, wide canvas: the bar becomes the study panel in its column beside
  // the Mushaf (features/shell/workspace-canvas.tsx). The column is found after
  // commit, so the panel follows it when the page changes; elsewhere (other
  // pages, a compact canvas) the reader keeps today's bar.
  const web = useWebDesign();
  const compact = useIsMobile(1000);
  const study = web && !compact;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setSlot(study && mode === "reading" ? document.getElementById("qb-study-slot") : null);
  }, [study, mode]);

  // Another side page beside the Mushaf (library, «انتقل», search…): a word or
  // verse picked there asks first, then opens the reader with its details. A
  // selection already open when you left the reader asks nothing.
  const pickKey = selection.keys.join(",");
  const seenInReader = useRef<string | null>(mode === "reading" ? pickKey : null);
  useEffect(() => {
    if (mode === "reading") seenInReader.current = pickKey;
  }, [mode, pickKey]);
  const confirmElsewhere = study && mode !== "reading" && seenInReader.current !== pickKey;

  const words = selection.keys.length;
  const single = words === 1;
  // A whole verse is not a phrase to search or count: those two actions go.
  const wholeVerse = selection.wholeVerse;
  const surahName = surahs.find((surah) => surah.id === selection.start.surah)?.name ?? `${selection.start.surah}`;
  const sameAyah = selection.start.surah === selection.end.surah && selection.start.ayah === selection.end.ayah;
  const ayahRef = sameAyah
    ? `${surahName}: ${formatNumber(selection.start.ayah)}`
    : selection.start.surah === selection.end.surah
      ? `${surahName}: ${formatNumber(selection.start.ayah)}–${formatNumber(selection.end.ayah)}`
      : `${surahName}: ${formatNumber(selection.start.ayah)} …`;

  // A new selection resets transient feedback (the count panel stays open).
  useEffect(() => {
    setCopied(false);
    setNote(null);
  }, [selection.text]);

  function search() {
    actions.runQuickExample({ query: selection.text, mode: "exact" });
    setMode("search");
  }

  async function searchRoot() {
    setRootBusy(true);
    setNote(null);
    try {
      const morphology = await api.getMorphology(selection.start.surah, selection.start.ayah, mushafId);
      const root = morphology.words.find((word) => word.position === selection.start.position)?.root;
      if (!root) {
        setNote(t("لا جذر لهذه الكلمة."));
        return;
      }
      actions.runQuickExample({ query: root, mode: "root" });
      setMode("search");
    } catch {
      setNote(t("تعذّر جلب الجذر."));
    } finally {
      setRootBusy(false);
    }
  }

  function ask() {
    queueStudioAsk(t("ما دلالة «{0}» في سورة {1} (الآية {2})؟", { 0: selection.text, 1: surahName, 2: selection.start.ayah }));
    setMode("studio");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`«${selection.text}» [${ayahRef}]`);
      setCopied(true);
    } catch {
      setNote(t("تعذّر النسخ."));
    }
  }

  if (confirmElsewhere) {
    const host = typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".qb-mushaf-stage");
    return host
      ? createPortal(
          <div className="qb-pick-confirm" role="dialog" aria-label={t("عرض التحديد في المصحف؟")}>
            <div className="copy">
              <strong>{t("عرض التحديد في المصحف؟")}</strong>
              <span>{t("تُغلق الصفحة الجانبية وتظهر تفاصيل «{0}» بجانب المصحف.", { 0: selection.text })}</span>
            </div>
            <div className="acts">
              <button type="button" className="go" onClick={() => setMode("reading")}>
                {t("انتقل إلى المصحف")}
              </button>
              <button type="button" onClick={onClear}>
                {t("إلغاء")}
              </button>
            </div>
          </div>,
          host,
        )
      : null;
  }

  // The study panel shows only in its column (reading mode, wide canvas).
  if (study && !slot) return null;

  // Portaled to <body> so it layers above the mobile tab bar and media bar.
  return createPortal(
    <div className={`qb-selection-bar${study ? " is-study" : ""}`} role="region" aria-label={t("الكلمات المحدّدة")}>
      {counting && !wholeVerse ? (
        <CountPanel selection={selection} mushafId={mushafId} onClose={() => setCounting(false)} />
      ) : null}
      <div className="row">
        <div className="picked">
          <span className="text" dir="rtl">«{selection.text}»</span>
          <span className="meta">
            {single ? t("كلمة") : tn("{0} كلمة", words, { 0: formatNumber(words) })}
            {t("، ")}
            {ayahRef}
          </span>
        </div>
        <button type="button" className="clear" onClick={onClear} aria-label={t("إلغاء التحديد")} title={t("إلغاء التحديد (Esc)")}>
          <Icon name="close" size={16} />
        </button>
      </div>
      {single ? <WordAnalysis selection={selection} mushafId={mushafId} /> : null}
      {study ? <StudyExtras selection={selection} mushafId={mushafId} /> : null}
      <div className="acts">
        {wholeVerse ? null : (
          <button type="button" onClick={search}>
            <Icon name="search" size={15} /> {t("بحث بالعبارة")}
          </button>
        )}
        {single ? (
          <button type="button" onClick={() => void searchRoot()} disabled={rootBusy}>
            <Icon name="tree" size={15} /> {t("مواضع الجذر")}
          </button>
        ) : null}
        <button type="button" onClick={ask}>
          <Icon name="sparkles" size={15} /> {t("اسأل الدراسة")}
        </button>
        {wholeVerse ? null : (
          <button type="button" className={counting ? "on" : ""} aria-pressed={counting} onClick={() => setCounting((v) => !v)}>
            <Icon name="graph" size={15} /> {t("إحصاء")}
          </button>
        )}
        <button type="button" onClick={() => void copy()}>
          <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? t("نُسخ") : t("نسخ مع المرجع")}
        </button>
      </div>
      {note ? <div className="note" role="status">{note}</div> : null}
    </div>,
    study && slot ? slot : document.body,
  );
}

/**
 * One picked word's analysis (formerly the «تحليل» tool's popover): root,
 * lemma, part of speech, grammar and features — inline in the bar, so it is
 * never clipped by the page and needs no second tool.
 */
function WordAnalysis({ selection, mushafId }: { selection: WordSelection; mushafId: number }) {
  const { data, loading } = useMorphology(selection.start.surah, selection.start.ayah, mushafId);
  const word = data?.words.find((entry) => entry.position === selection.start.position) ?? null;
  if (loading && !data) return <div className="analysis state">{t("جارٍ تحميل التحليل الصرفي…")}</div>;
  if (!word) return <div className="analysis state">{t("لا يتوفّر تحليل صرفي لهذه الكلمة.")}</div>;
  const cells: [string, string | null | undefined][] = [
    [t("الجذر"), word.root],
    [t("الأصل"), word.lemma],
    [t("القسم"), word.pos_label],
    [t("الإعراب"), word.case_label],
  ];
  return (
    <div className="analysis" aria-label={t("تحليل الكلمة: {0}", { 0: word.text })}>
      <dl>
        {cells.map(([label, value]) => (
          <div key={label} className="cell">
            <dt>{label}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      {word.features.length > 0 ? <div className="features">{word.features.join(" · ")}</div> : null}
    </div>
  );
}

function CountPanel({
  selection,
  mushafId,
  onClose,
}: {
  selection: WordSelection;
  mushafId: number;
  onClose: () => void;
}) {
  const formatNumber = useNumerals();
  const [data, setData] = useState<TextCountResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    api
      .getTextCount(selection.text, { mushaf: mushafId, surah: selection.start.surah, page: selection.page })
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [selection.text, selection.start.surah, selection.page, mushafId]);

  const cell = (value: number | null | undefined) => (value == null ? "—" : formatNumber(value));
  const row = (label: React.ReactNode, scopes: TextCountScopes, key: string) => (
    <tr key={key}>
      <th scope="row">{label}</th>
      <td>{cell(scopes.page)}</td>
      <td>{cell(scopes.surah)}</td>
      <td>{cell(scopes.quran)}</td>
    </tr>
  );

  return (
    <div className="count">
      <div className="count-head">
        <span>{t("إحصاء")}</span>
        <button type="button" onClick={onClose} aria-label={t("إغلاق الإحصاء")}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {error ? <div className="state">{t("تعذّر الإحصاء.")}</div> : null}
      {!data && !error ? <div className="state">{t("جارٍ الإحصاء…")}</div> : null}
      {data ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th scope="col">{t("الصفحة")}</th>
                  <th scope="col">{t("السورة")}</th>
                  <th scope="col">{t("القرآن")}</th>
                </tr>
              </thead>
              <tbody>
                {row(<span className="phrase">{data.word_count > 1 ? t("العبارة") : t("الكلمة")}</span>, data.phrase, "phrase")}
                {data.letters.map((letter) =>
                  row(
                    <span className="letter">
                      <b>{letter.letter}</b>
                      <small>×{formatNumber(letter.in_selection)}</small>
                    </span>,
                    letter,
                    letter.letter,
                  ),
                )}
              </tbody>
            </table>
          </div>
          <p className="fine">
            {t("على رسم المصحف دون تشكيل (صور الألف موحَّدة، والهمزة المفردة غير محتسبة). العبارة تُحصى كلماتٍ كاملة متتالية داخل الآية.")}
          </p>
        </>
      ) : null}
    </div>
  );
}

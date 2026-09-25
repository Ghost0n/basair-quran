"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { SurahListItem, TextCountResponse, TextCountScopes } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";
import { queueStudioAsk } from "@/lib/studio-prefill";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import type { WordSelection } from "./word-selection";

import { t } from "@/lib/i18n";

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
  const { setMode } = useShellMode();
  const { actions } = useWorkspace();
  const [counting, setCounting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rootBusy, setRootBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const words = selection.keys.length;
  const single = words === 1;
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

  // Portaled to <body> so it layers above the mobile tab bar and media bar.
  return createPortal(
    <div className="qb-selection-bar" role="region" aria-label={t("الكلمات المحدّدة")}>
      {counting ? (
        <CountPanel selection={selection} mushafId={mushafId} onClose={() => setCounting(false)} />
      ) : null}
      <div className="row">
        <div className="picked">
          <span className="text" dir="rtl">«{selection.text}»</span>
          <span className="meta">
            {single ? t("كلمة") : t("{0} كلمات", { 0: formatNumber(words) })}
            {t("، ")}
            {ayahRef}
          </span>
        </div>
        <button type="button" className="clear" onClick={onClear} aria-label={t("إلغاء التحديد")} title={t("إلغاء التحديد (Esc)")}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="acts">
        <button type="button" onClick={search}>
          <Icon name="search" size={15} /> {t("بحث بالعبارة")}
        </button>
        {single ? (
          <button type="button" onClick={() => void searchRoot()} disabled={rootBusy}>
            <Icon name="tree" size={15} /> {t("مواضع الجذر")}
          </button>
        ) : null}
        <button type="button" onClick={ask}>
          <Icon name="sparkles" size={15} /> {t("اسأل الدراسة")}
        </button>
        <button type="button" className={counting ? "on" : ""} aria-pressed={counting} onClick={() => setCounting((v) => !v)}>
          <Icon name="graph" size={15} /> {t("إحصاء")}
        </button>
        <button type="button" onClick={() => void copy()}>
          <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? t("نُسخ") : t("نسخ مع المرجع")}
        </button>
      </div>
      {note ? <div className="note" role="status">{note}</div> : null}
    </div>,
    document.body,
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

"use client";

// The sheet frame (.qb-rsheet) is the reader's; the picker's own look is in documents.css.
import "@/features/reading/reading.css";

import { useEffect, useMemo, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { AyahRef, NotebookItem, SearchMode, SearchVerse, SurahListItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";
import { useDialog } from "@/lib/use-dialog";
import { useStickyState } from "@/lib/use-sticky-state";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

type Source = "notebook" | "search" | "goto";

const refKey = (ref: Pick<AyahRef, "surah_id" | "ayah">) => `${ref.surah_id}:${ref.ayah}`;

/**
 * «أضف آيات» — bring verses into a research section from the three places a
 * researcher already has them: the notebook (saved ayahs), a Quran search
 * (word or root), or a direct reference (surah + ayah, like the reader's
 * «انتقل»). Picked verses are added with an empty text: the server fills the
 * mushaf text on save and verifies it.
 */
export function AyahPicker({
  surahs,
  existing,
  onAdd,
  onClose,
}: {
  surahs: SurahListItem[];
  existing: AyahRef[];
  onAdd: (refs: AyahRef[]) => void;
  onClose: () => void;
}) {
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const formatNumber = useNumerals();
  const [source, setSource] = useStickyState<Source>("qb.doc.ayahSource", "notebook", ["notebook", "search", "goto"]);
  const [picked, setPicked] = useState<Map<string, AyahRef>>(new Map());
  const already = useMemo(() => new Set(existing.map(refKey)), [existing]);

  function toggle(ref: AyahRef) {
    setPicked((current) => {
      const next = new Map(current);
      const key = refKey(ref);
      if (next.has(key)) next.delete(key);
      else next.set(key, ref);
      return next;
    });
  }

  const surahName = (id: number) => surahs.find((surah) => surah.id === id)?.name ?? String(id);

  const row = (ref: AyahRef, text: string | null | undefined) => {
    const key = refKey(ref);
    const inDoc = already.has(key);
    const on = picked.has(key);
    return (
      <li key={key}>
        <label className={`${on ? "on" : ""}${inDoc ? " in-doc" : ""}`}>
          <input type="checkbox" checked={on || inDoc} disabled={inDoc} onChange={() => toggle(ref)} />
          <span className="ref">
            ﴿{surahName(ref.surah_id)}: {formatNumber(ref.ayah)}﴾{inDoc ? ` · ${t("في البحث")}` : ""}
          </span>
          {text ? <span className="text">{text}</span> : null}
        </label>
      </li>
    );
  };

  return (
    <div className="qb-rsheet qb-ayah-picker" role="dialog" aria-modal="true" aria-label={t("أضف آيات")}>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2>{t("أضف آيات")}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="seg sources" role="tablist" aria-label={t("مصدر الآيات")}>
          {(
            [
              ["notebook", "notebook", t("من الدفتر")],
              ["search", "search", t("بحث")],
              ["goto", "compass", t("انتقل")],
            ] as const
          ).map(([value, icon, label]) => (
            <button key={value} type="button" role="tab" aria-selected={source === value} className={source === value ? "active" : ""} onClick={() => setSource(value)}>
              <Icon name={icon} size={15} /> {label}
            </button>
          ))}
        </div>

        <div className="body">
          {source === "notebook" ? <NotebookSource row={row} /> : null}
          {source === "search" ? <SearchSource row={row} /> : null}
          {source === "goto" ? <GotoSource surahs={surahs} onPick={toggle} picked={picked} already={already} /> : null}
        </div>

        <div className="foot">
          <span className="count">{picked.size ? t("المختار: {0}", { 0: formatNumber(picked.size) }) : t("اختر آية أو أكثر")}</span>
          <button
            type="button"
            className="qb-btn primary"
            disabled={picked.size === 0}
            onClick={() => {
              onAdd([...picked.values()]);
              onClose();
            }}
          >
            <Icon name="plus" size={14} /> {t("أضف إلى البحث")}
          </button>
        </div>
      </div>
    </div>
  );
}

type Row = (ref: AyahRef, text: string | null | undefined) => React.ReactNode;

function NotebookSource({ row }: { row: Row }) {
  const [items, setItems] = useState<NotebookItem[] | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    api.getNotebook().then(setItems).catch(() => setItems([]));
  }, []);
  if (items === null) return <p className="state">{t("جارٍ التحميل…")}</p>;
  const usable = items.filter((item) => item.surah_id != null && item.ayah != null);
  if (usable.length === 0) return <p className="state">{t("لا آيات في الدفتر بعد.")}</p>;
  const needle = filter.trim();
  const shown = needle ? usable.filter((item) => `${item.surah ?? ""} ${item.text ?? ""}`.includes(needle)) : usable;
  return (
    <>
      <input className="filter" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t("تصفية")} aria-label={t("تصفية آيات الدفتر")} />
      <ul className="list">
        {shown.map((item) =>
          row({ mushaf_id: item.mushaf_id || 2, surah_id: item.surah_id!, ayah: item.ayah!, ayah_id: item.ayah_id, text: "" }, item.text),
        )}
      </ul>
    </>
  );
}

function SearchSource({ row }: { row: Row }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("exact");
  const [verses, setVerses] = useState<SearchVerse[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    try {
      const response = await api.searchV2(q, mode, 2, 50);
      setVerses(response.results.flatMap((result) => result.verses));
    } catch {
      setVerses([]);
    } finally {
      setBusy(false);
    }
  }

  const unique = verses ? [...new Map(verses.map((verse) => [`${verse.surah_id}:${verse.ayah}`, verse])).values()] : null;
  return (
    <>
      <form
        className="search"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <input type="search" dir="rtl" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("كلمة أو عبارة أو جذر…")} aria-label={t("ابحث في القرآن")} />
        <select value={mode} onChange={(event) => setMode(event.target.value as SearchMode)} aria-label={t("نوع البحث")}>
          <option value="exact">{t("لفظ")}</option>
          <option value="root">{t("جذر")}</option>
        </select>
        <button type="submit" className="qb-btn ghost" disabled={busy || !query.trim()}>
          <Icon name="search" size={14} />
        </button>
      </form>
      {busy ? <p className="state">{t("جارٍ البحث…")}</p> : null}
      {unique && !busy ? (
        unique.length === 0 ? (
          <p className="state">{t("لا نتائج مطابقة.")}</p>
        ) : (
          <ul className="list">
            {unique.map((verse) => row({ mushaf_id: verse.mushaf_id || 2, surah_id: verse.surah_id, ayah: verse.ayah, ayah_id: verse.ayah_id, text: "" }, verse.text))}
          </ul>
        )
      ) : null}
    </>
  );
}

function GotoSource({
  surahs,
  picked,
  already,
  onPick,
}: {
  surahs: SurahListItem[];
  picked: Map<string, AyahRef>;
  already: Set<string>;
  onPick: (ref: AyahRef) => void;
}) {
  const formatNumber = useNumerals();
  const [surahId, setSurahId] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const surah = surahs.find((item) => item.id === surahId);
  const max = surah?.ayah_count ?? 286;
  const start = Math.min(Math.max(1, from), max);
  const end = Math.min(Math.max(start, to), max, start + 49);
  const range = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <>
      <div className="goto">
        <label>
          <span>{t("السورة")}</span>
          <select value={surahId} onChange={(event) => { setSurahId(Number(event.target.value)); setFrom(1); setTo(1); }}>
            {surahs.map((item) => (
              <option key={item.id} value={item.id}>
                {formatNumber(item.id)}. {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("من الآية")}</span>
          <input type="number" min={1} max={max} value={from} onChange={(event) => { const v = Number(event.target.value) || 1; setFrom(v); if (to < v) setTo(v); }} />
        </label>
        <label>
          <span>{t("إلى")}</span>
          <input type="number" min={start} max={max} value={to} onChange={(event) => setTo(Number(event.target.value) || start)} />
        </label>
      </div>
      <p className="fine">{t("{0} آية في السورة", { 0: formatNumber(max) })}</p>
      <div className="goto-chips">
        {range.map((ayah) => {
          const key = `${surahId}:${ayah}`;
          const inDoc = already.has(key);
          return (
            <button
              key={key}
              type="button"
              className={picked.has(key) || inDoc ? "on" : ""}
              disabled={inDoc}
              aria-pressed={picked.has(key)}
              onClick={() => onPick({ mushaf_id: 2, surah_id: surahId, ayah, ayah_id: null, text: "" })}
            >
              {formatNumber(ayah)}
            </button>
          );
        })}
      </div>
    </>
  );
}

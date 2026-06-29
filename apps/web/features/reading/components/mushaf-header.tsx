"use client";

import { useState } from "react";

import type { QuranPageResponse, SurahListItem } from "@q-basair/shared";

import { Icon, type IconName } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";

type NavMode = "page" | "surah" | "ayah" | "juz";

const NAV_PILLS: { mode: NavMode; label: string; icon: IconName }[] = [
  { mode: "page", label: "صفحة", icon: "page" },
  { mode: "ayah", label: "آية", icon: "cards" },
  { mode: "surah", label: "سورة", icon: "book" },
  { mode: "juz", label: "جزء", icon: "layers" },
];

function surahTypeLabel(type?: string | null): string {
  if (type === "meccan") return "مكّيّة";
  if (type === "medinan") return "مدنيّة";
  return "";
}

export function MushafHeader({
  pageData,
  surahs,
  onJumpPage,
  onJumpSurah,
  onJumpJuz,
}: {
  pageData: QuranPageResponse;
  surahs: SurahListItem[];
  onJumpPage: (page: number) => void;
  onJumpSurah: (surahId: number, ayah?: number) => void;
  onJumpJuz: (juz: number) => void;
}) {
  const formatNumber = useNumerals();
  const [navMode, setNavMode] = useState<NavMode>("page");
  const [pageDraft, setPageDraft] = useState("");
  const [surahDraft, setSurahDraft] = useState("");
  const [ayahDraft, setAyahDraft] = useState("");
  const [juzDraft, setJuzDraft] = useState("");

  const currentSurahId = pageData.ayahs[0]?.surah_id;
  const currentSurah = surahs.find((s) => s.id === currentSurahId);
  const maxPage = pageData.total_pages ?? pageData.max_page ?? 604;

  return (
    <>
      <div className="qb-mushaf-head">
        <div className="qb-surah-card">
          <span className="h-name">{currentSurah?.name ?? pageData.ayahs[0]?.surah ?? "المصحف"}</span>
          <span className="h-meta">
            {currentSurah ? (
              <>
                <strong>سورة {formatNumber(currentSurah.id)}</strong>
                {surahTypeLabel(currentSurah.type) ? ` · ${surahTypeLabel(currentSurah.type)}` : ""}
                {` · ${formatNumber(currentSurah.ayah_count)} آية`}
              </>
            ) : (
              <strong>صفحة {formatNumber(pageData.page ?? 1)}</strong>
            )}
          </span>
        </div>

        <div className="qb-mushaf-tools">
          {NAV_PILLS.map((pill) => (
            <button
              key={pill.mode}
              type="button"
              className={`qb-pill${navMode === pill.mode ? " active" : ""}`}
              onClick={() => setNavMode(pill.mode)}
            >
              <Icon name={pill.icon} size={13} />
              {pill.label}
              {pill.mode === "page" ? <span className="num" dir="ltr">{formatNumber(pageData.page ?? 1)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="qb-jump-bar">
        {navMode === "page" ? (
          <>
            <label htmlFor="qbJumpPage">انتقل إلى صفحة</label>
            <input
              id="qbJumpPage"
              type="number"
              min={1}
              max={maxPage}
              value={pageDraft}
              placeholder={String(pageData.page ?? 1)}
              onChange={(e) => setPageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pageDraft) onJumpPage(Number(pageDraft));
              }}
            />
            <button type="button" className="qb-jump-go" onClick={() => pageDraft && onJumpPage(Number(pageDraft))}>
              انتقال
            </button>
          </>
        ) : null}

        {navMode === "surah" ? (
          <>
            <label htmlFor="qbJumpSurah">انتقل إلى سورة</label>
            <select id="qbJumpSurah" value={surahDraft} onChange={(e) => setSurahDraft(e.target.value)}>
              <option value="">اختر سورة…</option>
              {surahs.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatNumber(s.id)} · {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="qb-jump-go"
              onClick={() => surahDraft && onJumpSurah(Number(surahDraft))}
            >
              انتقال
            </button>
          </>
        ) : null}

        {navMode === "ayah" ? (
          <>
            <label htmlFor="qbJumpAyahSurah">انتقل إلى آية</label>
            <select id="qbJumpAyahSurah" value={surahDraft} onChange={(e) => setSurahDraft(e.target.value)}>
              <option value="">السورة…</option>
              {surahs.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatNumber(s.id)} · {s.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={ayahDraft}
              placeholder="رقم الآية"
              onChange={(e) => setAyahDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && surahDraft) {
                  onJumpSurah(Number(surahDraft), ayahDraft ? Number(ayahDraft) : undefined);
                }
              }}
            />
            <button
              type="button"
              className="qb-jump-go"
              onClick={() =>
                surahDraft && onJumpSurah(Number(surahDraft), ayahDraft ? Number(ayahDraft) : undefined)
              }
            >
              انتقال
            </button>
          </>
        ) : null}

        {navMode === "juz" ? (
          <>
            <label htmlFor="qbJumpJuz">انتقل إلى جزء</label>
            <select id="qbJumpJuz" value={juzDraft} onChange={(e) => setJuzDraft(e.target.value)}>
              <option value="">اختر جزءاً…</option>
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  الجزء {formatNumber(n)}
                </option>
              ))}
            </select>
            <button type="button" className="qb-jump-go" onClick={() => juzDraft && onJumpJuz(Number(juzDraft))}>
              انتقال
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}

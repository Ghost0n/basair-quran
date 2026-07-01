"use client";

import { useState } from "react";

import type { QuranPageResponse, SurahListItem } from "@q-basair/shared";

import { Icon, type IconName } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { useNumerals } from "@/lib/preferences-context";

type NavMode = "surah" | "ayah" | "juz";

// Page navigation now lives in the (editable) footer indicator, so the
// header jump bar covers ayah / surah / juz only.
const NAV_PILLS: { mode: NavMode; label: string; icon: IconName }[] = [
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
  onJumpSurah,
  onJumpJuz,
}: {
  pageData: QuranPageResponse;
  surahs: SurahListItem[];
  onJumpSurah: (surahId: number, ayah?: number) => void;
  onJumpJuz: (juz: number) => void;
}) {
  const formatNumber = useNumerals();
  const [navMode, setNavMode] = useState<NavMode>("surah");
  const [surahDraft, setSurahDraft] = useState("");
  const [ayahDraft, setAyahDraft] = useState("");

  const currentSurahId = pageData.ayahs[0]?.surah_id;
  const currentSurah = surahs.find((s) => s.id === currentSurahId);

  const surahOptions = surahs.map((s) => ({ value: String(s.id), label: `${formatNumber(s.id)} · ${s.name}` }));
  const juzOptions = Array.from({ length: 30 }, (_, i) => i + 1).map((n) => ({
    value: String(n),
    label: `الجزء ${formatNumber(n)}`,
  }));

  return (
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

      {/* Nav pills + the active mode's selector, inline on one row to keep the
          reading area as tall (and the page as large) as possible. */}
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
          </button>
        ))}

        <div className="qb-jump-inline">
          {navMode === "surah" ? (
            <SelectMenu
              className="qb-jump-select"
              ariaLabel="انتقل إلى سورة"
              value=""
              placeholder="اختر سورة…"
              options={surahOptions}
              onChange={(value) => value && onJumpSurah(Number(value))}
            />
          ) : null}

          {navMode === "ayah" ? (
            <>
              <SelectMenu
                className="qb-jump-select"
                ariaLabel="السورة"
                value={surahDraft}
                placeholder="السورة…"
                options={surahOptions}
                onChange={setSurahDraft}
              />
              <input
                id="qbJumpAyah"
                type="number"
                min={1}
                value={ayahDraft}
                placeholder="الآية"
                aria-label="رقم الآية"
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
            <SelectMenu
              className="qb-jump-select"
              ariaLabel="انتقل إلى جزء"
              value=""
              placeholder="اختر جزءاً…"
              options={juzOptions}
              onChange={(value) => value && onJumpJuz(Number(value))}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

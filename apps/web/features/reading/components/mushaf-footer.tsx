"use client";

import { useState } from "react";

import type { QuranPageResponse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { useRecitation } from "@/features/recitation/recitation-context";

import { AudioMiniPlayer } from "./audio-mini-player";

export function MushafFooter({
  pageData,
  riwayahLabel,
  isLoading,
  onPrev,
  onNext,
  onJumpPage,
}: {
  pageData: QuranPageResponse;
  riwayahLabel: string;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJumpPage: (page: number) => void;
}) {
  const formatNumber = useNumerals();
  const recitation = useRecitation();
  const { preferences, updateAccount } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const firstAyah = pageData.ayahs[0];
  const mushafId = pageData.mushaf_id ?? 0;
  const savedPages = preferences.saved_pages ?? [];
  const pageSaved = savedPages.some((entry) => entry.page === (pageData.page ?? 1) && entry.mushaf_id === mushafId);

  function toggleSavePage() {
    const page = pageData.page ?? 1;
    const next = pageSaved
      ? savedPages.filter((entry) => !(entry.page === page && entry.mushaf_id === mushafId))
      : [
          {
            page,
            mushaf_id: mushafId,
            surah: firstAyah?.surah ?? null,
            surah_id: firstAyah?.surah_id ?? null,
            saved_at: Math.floor(Date.now() / 1000),
          },
          ...savedPages,
        ];
    void updateAccount({ saved_pages: next });
  }
  const juzLabel =
    pageData.juz != null
      ? pageData.juz_secondary != null
        ? `${formatNumber(pageData.juz)}–${formatNumber(pageData.juz_secondary)}`
        : formatNumber(pageData.juz)
      : "—";
  const page = pageData.page ?? 1;
  const totalPages = pageData.total_pages ?? pageData.max_page ?? 604;

  function commitPage() {
    setEditing(false);
    const next = Number(draft);
    if (Number.isFinite(next) && next >= 1 && next <= totalPages && next !== page) {
      onJumpPage(next);
    }
  }

  return (
    <div className="qb-mushaf-foot qb-mushaf-foot-hardened">
      <span className="meta">
        <Icon name="layers" size={13} /> جزء <strong>{juzLabel}</strong>
      </span>
      <span className="sep" />
      <span className="meta">
        رواية <strong>{riwayahLabel}</strong>
      </span>

      <AudioMiniPlayer
        surah={pageData.ayahs[0]?.surah_id}
        ayah={pageData.ayahs[0]?.ayah}
      />

      {/* Open the play bar in an IDLE state — pick a reciter first, then press
          play — without starting playback immediately. */}
      <button
        type="button"
        className="qb-foot-reciter"
        onClick={() =>
          recitation.openIdle(
            firstAyah ? { surah: firstAyah.surah_id, ayah: firstAyah.ayah } : null,
          )
        }
        title="افتح شريط التلاوة — اختر قارئاً ثم شغّل"
        aria-label="افتح شريط التلاوة"
      >
        <Icon name="ear" size={13} />
        التلاوة
      </button>

      {/* Bookmark this page — surfaced on Home to reopen the reader here. */}
      <button
        type="button"
        className={`qb-foot-savepage${pageSaved ? " on" : ""}`}
        onClick={toggleSavePage}
        title={pageSaved ? "إزالة الصفحة من المحفوظات" : "احفظ هذه الصفحة"}
        aria-label={pageSaved ? "إزالة الصفحة من المحفوظات" : "احفظ هذه الصفحة"}
        aria-pressed={pageSaved}
      >
        <Icon name={pageSaved ? "bookmarkFilled" : "bookmark"} size={13} />
      </button>

      <div className="pager">
        <button
          type="button"
          className="nav"
          onClick={onPrev}
          disabled={isLoading || !pageData.has_previous}
          aria-label="الصفحة السابقة"
        >
          <Icon name="chevRight" size={14} />
        </button>
        {editing ? (
          <div className="pages editing" dir="ltr">
            <input
              type="number"
              min={1}
              max={totalPages}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitPage();
                else if (event.key === "Escape") setEditing(false);
              }}
              onBlur={commitPage}
              aria-label="رقم الصفحة"
            />
            <span>/ {formatNumber(totalPages)}</span>
          </div>
        ) : (
          <button
            type="button"
            className="pages"
            dir="ltr"
            onClick={() => {
              setDraft(String(page));
              setEditing(true);
            }}
            title="انتقل إلى صفحة"
            aria-label={`الصفحة ${formatNumber(page)} من ${formatNumber(totalPages)} — اضغط للانتقال إلى صفحة أخرى`}
          >
            {formatNumber(page)} / {formatNumber(totalPages)}
          </button>
        )}
        <button
          type="button"
          className="nav"
          onClick={onNext}
          disabled={isLoading || !pageData.has_next}
          aria-label="الصفحة التالية"
        >
          <Icon name="chevLeft" size={14} />
        </button>
      </div>
    </div>
  );
}

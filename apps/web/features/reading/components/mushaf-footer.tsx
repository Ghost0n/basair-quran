"use client";

import { useState } from "react";

import type { QuranPageResponse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
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

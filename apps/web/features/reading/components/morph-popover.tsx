"use client";

import { useEffect } from "react";

import { Icon } from "@/components/icon";

import { useMorphology } from "../use-morphology";

// Consonant-skeleton fold so the clicked word matches the morphology entry even
// when marks/spelling differ (riwāyāt) — a fallback when position drifts.
function skeleton(text: string): string {
  const fold: Record<string, string> = {
    "آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ى": "ي", "ئ": "ي", "ؤ": "و", "ة": "ه",
  };
  return [...text]
    .filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return (cp >= 0x0621 && cp <= 0x064a) || cp === 0x0671;
    })
    .map((ch) => fold[ch] ?? ch)
    .join("")
    .replace(/ء/g, "");
}

export type MorphTarget = {
  surah: number;
  ayah: number;
  position: number;
  word: string;
  /** Full displayed ayah text — used to match the verse across riwāyāt. */
  ayahText?: string;
  top: number;
  left: number;
};

/**
 * Morphology popover — per-word root / lemma / part-of-speech, fetched
 * from /api/morphology and cached by ayah. Opened by clicking any word
 * in the Mushaf.
 */
export function MorphPopover({ target, onClose }: { target: MorphTarget; onClose: () => void }) {
  const { data, loading } = useMorphology(target.surah, target.ayah, target.ayahText);

  // B1: ESC key closes the popover.
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const word =
    data?.words.find((entry) => entry.position === target.position) ??
    data?.words.find((entry) => skeleton(entry.text) === skeleton(target.word)) ??
    null;

  return (
    <div className="qb-morph-pop" style={{ top: target.top, insetInlineStart: target.left }}>
      {/* U11: flex header keeps word and close button in a clean row */}
      <div className="pop-head">
        <div className="word">{word?.text ?? target.word}</div>
        <button type="button" className="close" onClick={onClose} aria-label="إغلاق">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="gloss">
        {loading ? "جارٍ تحميل التحليل الصرفي…" : word ? word.pos_label : "لا يتوفّر تحليل صرفي لهذه الكلمة."}
      </div>
      <div className="grid">
        <div className="cell">
          <div className="l">الجذر</div>
          <div className="v">{word?.root ?? "—"}</div>
        </div>
        <div className="cell">
          <div className="l">الأصل</div>
          <div className="v">{word?.lemma ?? "—"}</div>
        </div>
        <div className="cell">
          <div className="l">القسم</div>
          <div className="v">{word?.pos_label ?? "—"}</div>
        </div>
        <div className="cell">
          <div className="l">الإعراب</div>
          <div className="v">{word?.case_label ?? "—"}</div>
        </div>
      </div>
      {word && word.features.length > 0 ? (
        <div className="note">السمات: {word.features.join(" · ")}</div>
      ) : null}
    </div>
  );
}

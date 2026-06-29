"use client";

import { Icon } from "@/components/icon";
import { useRecitation } from "@/features/recitation/recitation-context";

/**
 * Inline audio mini-player in the Mushaf footer. Plays the first ayah of
 * the current page through the global recitation element; shows live
 * progress while a recitation is running.
 */
export function AudioMiniPlayer({ surah, ayah }: { surah?: number; ayah?: number }) {
  const recitation = useRecitation();
  const playable = typeof surah === "number" && typeof ayah === "number";
  const isThisAyah =
    recitation.current?.surah === surah && recitation.current?.ayah === ayah;

  function onClick() {
    if (!playable) return;
    if (isThisAyah) {
      recitation.toggle();
    } else {
      recitation.playAyah(surah as number, ayah as number);
    }
  }

  return (
    <span className="qb-audio" title="التلاوة الصوتية">
      <button
        type="button"
        className="play"
        onClick={onClick}
        disabled={!playable}
        aria-label={isThisAyah && recitation.isPlaying ? "إيقاف التلاوة" : "تشغيل التلاوة"}
      >
        <Icon name={isThisAyah && recitation.isPlaying ? "pause" : "play"} size={11} />
      </button>
      <span className="label">{recitation.reciter ? recitation.reciter.name : "التلاوة"}</span>
      <span className="progress" aria-hidden>
        <span style={{ width: isThisAyah ? `${Math.round(recitation.progress * 100)}%` : "0%" }} />
      </span>
    </span>
  );
}

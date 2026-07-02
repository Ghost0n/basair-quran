"use client";

import { Icon } from "@/components/icon";
import { useRecitation } from "@/features/recitation/recitation-context";

/**
 * Footer "play this page" chip. Starts recitation from the page's first ayah
 * through the global recitation element; once playing, the floating media bar
 * owns the transport, progress, and reciter identity — this chip stays a
 * contextual shortcut (and a pause toggle while its own ayah is playing).
 */
export function AudioMiniPlayer({ surah, ayah }: { surah?: number; ayah?: number }) {
  const recitation = useRecitation();
  const playable = typeof surah === "number" && typeof ayah === "number";
  const isThisAyah =
    recitation.current?.surah === surah && recitation.current?.ayah === ayah;
  const isPlayingHere = isThisAyah && recitation.isPlaying;

  function onClick() {
    if (!playable) return;
    if (isThisAyah) {
      recitation.toggle();
    } else {
      recitation.playAyah(surah as number, ayah as number);
    }
  }

  return (
    <span className="qb-audio" title="تلاوة من بداية الصفحة">
      <button
        type="button"
        className="play"
        onClick={onClick}
        disabled={!playable}
        aria-label={isPlayingHere ? "إيقاف التلاوة" : "تشغيل التلاوة من هذه الصفحة"}
      >
        <Icon name={isPlayingHere ? "pause" : "play"} size={11} />
      </button>
      <span className="label">تلاوة الصفحة</span>
    </span>
  );
}

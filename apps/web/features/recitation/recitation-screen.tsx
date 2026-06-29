"use client";

import "./recitation.css";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { formatNumber } from "@/lib/numerals";

import { RECITATION_SPEEDS, useRecitation } from "./recitation-context";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * Recitation room — pick a reciter and listen ayah by ayah. Audio is the
 * global element owned by RecitationProvider; repeat-ayah and speed give
 * the ḥifẓ-grade controls.
 */
export function RecitationScreen() {
  const recitation = useRecitation();
  const { current, reciter } = recitation;
  const [ayahText, setAyahText] = useState<string>("");

  useEffect(() => {
    if (!current) {
      setAyahText("");
      return;
    }
    let cancelled = false;
    api
      .getQuranPageForSurah(1, current.surah, current.ayah)
      .then((page) => {
        if (cancelled) return;
        const match = page.ayahs.find((ayah) => ayah.is_selected) ?? page.ayahs[0];
        setAyahText(match ? match.text.trim() : "");
      })
      .catch(() => {
        if (!cancelled) setAyahText("");
      });
    return () => {
      cancelled = true;
    };
  }, [current]);

  return (
    <div className="qb-recitation">
      <aside className="qb-reciter-list" aria-label="القرّاء">
        <div className="kicker">القرّاء · RECITERS</div>
        {recitation.reciters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`qb-reciter-row${item.id === recitation.reciterId ? " active" : ""}`}
            onClick={() => recitation.setReciter(item.id)}
          >
            <span className="avatar">
              {/* U3: 'ear' at 18 px looked like '?'. Use 'user' for idle, 'volume' for active playing. */}
              <Icon name={item.id === recitation.reciterId && recitation.isPlaying ? "volume" : "user"} size={18} />
            </span>
            <span className="info">
              <span className="name">{item.name}</span>
              <span className="meta">
                {item.name_english} · رواية {item.riwayah === "hafs" ? "حفص" : item.riwayah}
              </span>
            </span>
          </button>
        ))}
      </aside>

      <div className="qb-recitation-theatre">
        {current ? (
          <>
            <div className="now-label">الآن تَستمع إلى</div>
            <div className="reciter-name">{reciter?.name ?? "—"}</div>
            <div className="ref">
              سورة {formatNumber(current.surah)} · آية {formatNumber(current.ayah)}
            </div>
            {ayahText ? <div className="qb-recitation-ayah">{ayahText}</div> : null}

            <div className="qb-recitation-controls">
              <div className="qb-recitation-progress">
                <span style={{ width: `${Math.round(recitation.progress * 100)}%` }} />
              </div>
              <div className="qb-recitation-buttons">
                <button type="button" className="nav" onClick={recitation.prev} aria-label="الآية السابقة">
                  <Icon name="chevRight" size={18} />
                </button>
                <button
                  type="button"
                  className="play"
                  onClick={recitation.toggle}
                  aria-label={recitation.isPlaying ? "إيقاف" : "تشغيل"}
                >
                  <Icon name={recitation.isPlaying ? "pause" : "play"} size={26} />
                </button>
                <button type="button" className="nav" onClick={recitation.next} aria-label="الآية التالية">
                  <Icon name="chevLeft" size={18} />
                </button>
              </div>
              <div className="qb-recitation-buttons">
                <button
                  type="button"
                  className={`chip${recitation.repeatAyah ? " active" : ""}`}
                  onClick={recitation.toggleRepeat}
                >
                  تكرار الآية
                </button>
                {RECITATION_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={`chip${recitation.speed === speed ? " active" : ""}`}
                    onClick={() => recitation.setSpeed(speed)}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="qb-recitation-empty">
            اختر قارئاً وابدأ الاستماع.
            <br />
            <button
              type="button"
              className="chip active"
              style={{ marginTop: 16 }}
              onClick={() => recitation.playAyah(1, 1)}
            >
              ابدأ من الفاتحة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

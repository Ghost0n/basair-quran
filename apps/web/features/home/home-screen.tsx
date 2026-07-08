"use client";

import "./home.css";

import { useEffect, useState, type FormEvent } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ResearchSessionSummary, SavedPageEntry } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { useAuthSession } from "@/lib/auth-session-context";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { looksLikeQuestion, queueStudioAsk, queueStudioOpenSession } from "@/lib/studio-prefill";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";
const LAST_SURAH_KEY = "qbasair.mushaf.lastSurah";

// A small rotating set of well-known āyāt — the page's centerpiece. The text is
// shown exactly as in the muṣḥaf; only the reference number follows the numeral
// preference. Any addition must be exact Uthmani text, 2–6 words, owner-reviewed.
const ROTATING_AYAHS: { text: string; surah: string; ayah: number }[] = [
  { text: "ٱللَّهُ نُورُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ", surah: "النور", ayah: 35 },
  { text: "وَقُل رَّبِّ زِدْنِى عِلْمًا", surah: "طه", ayah: 114 },
  { text: "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا", surah: "الشرح", ayah: 6 },
  { text: "فَٱذْكُرُونِىٓ أَذْكُرْكُمْ", surah: "البقرة", ayah: 152 },
  { text: "وَبَشِّرِ ٱلصَّٰبِرِينَ", surah: "البقرة", ayah: 155 },
];

const ROTATE_MS = 9000;

/**
 * HomeScreen — the default landing. The rotating āyah is the hero (the Qurʾān is
 * the room's centerpiece — the brand lives in the shell chrome, whispered here
 * as a kufi kicker); beneath it, compact furniture: the ask/search bar, a desk
 * row (continue-reading + library stats), three entry tiles, and the latest
 * research sessions. One glance orients, one click reaches every room.
 */
export function HomeScreen() {
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const { actions } = useWorkspace();
  const { preferences } = usePreferences();
  const mushaf = useMushaf();
  const savedPages = preferences.saved_pages ?? [];

  function openSavedPage(entry: SavedPageEntry) {
    void mushaf.loadPage(entry.mushaf_id || 1, entry.page, { persist: true });
    setMode("reading");
  }

  const [ask, setAsk] = useState("");
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [lastSurah, setLastSurah] = useState<string | null>(null);
  const [ayahIndex, setAyahIndex] = useState(0);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [recentSessions, setRecentSessions] = useState<ResearchSessionSummary[]>([]);
  // Personalized greeting — only when signed in. Reads the shared session probe,
  // so it also reflects a name change made in settings this session.
  const { user } = useAuthSession();
  const displayName = AUTH_ENABLED ? user?.name ?? null : null;

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(LAST_PAGE_KEY));
      if (Number.isFinite(stored) && stored >= 1) setLastPage(stored);
      setLastSurah(window.localStorage.getItem(LAST_SURAH_KEY));
    } catch {
      /* no last page — the continue pill falls back to "start reading" */
    }
    // Seed the opening verse by day, so returning users don't always land on
    // the same āyah (client-side effect — no SSR hydration mismatch).
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
    );
    setAyahIndex(dayOfYear % ROTATING_AYAHS.length);
  }, []);

  // Light desk stats + the latest research sessions. Each source fails silently
  // (the row simply doesn't render) so an unreachable store can't mar the Home.
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([api.getNotebook(), api.getSessions()]).then(([notebook, sessions]) => {
      if (cancelled) return;
      if (notebook.status === "fulfilled") setSavedCount(notebook.value.length);
      if (sessions.status === "fulfilled") setRecentSessions(sessions.value.slice(0, 3));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setAyahIndex((index) => (index + 1) % ROTATING_AYAHS.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  // Same intent routing as the command bar: a natural-language question goes to
  // the Studio; a short root/word/phrase runs as a search (URL-driven, so the
  // workspace picks it up). The submit button label mirrors the detected intent.
  const askIsQuestion = !ask.trim() || looksLikeQuestion(ask);

  function submitAsk(event: FormEvent) {
    event.preventDefault();
    const value = ask.trim();
    if (!value) return;
    setAsk("");
    if (looksLikeQuestion(value)) {
      queueStudioAsk(value);
      setMode("studio");
    } else {
      // Runs through the shared workspace (same path as the command bar's
      // example chips); the workspace-active effect switches the mode itself.
      actions.runQuickExample({ query: value, mode: "exact" });
    }
  }

  const ayah = ROTATING_AYAHS[ayahIndex];

  return (
    <div className="qb-home">
      <div className="qb-home-inner">
        {/* Personalized greeting — signed-in only; a quiet line above the hero. */}
        {displayName ? (
          <div className="qb-home-greeting">
            أهلاً بعودتك، <strong>{displayName}</strong>
          </div>
        ) : null}

        {/* The verse holds the seat of honor; the brand is a whisper above it.
            No aria-live: a forever-rotating announcement is screen-reader noise —
            the verse stays ordinary readable (and selectable) text. */}
        <header className="qb-home-ayah-hero">
          <span className="kicker">بَصَائِر</span>
          <p key={ayahIndex} className="ayah-text">
            {ayah.text}
          </p>
          <span className="ayah-ref">
            {ayah.surah} · {formatNumber(ayah.ayah)}
          </span>
        </header>

        <form className="qb-home-ask" onSubmit={submitAsk} role="search">
          <Icon name="sparkles" size={18} />
          <input
            type="text"
            value={ask}
            onChange={(event) => setAsk(event.target.value)}
            placeholder="اسأل سؤالاً… أو اكتب جذراً/كلمة للبحث"
            aria-label="اسأل سؤالاً أو ابحث في القرآن"
            dir="rtl"
          />
          <button type="submit" disabled={!ask.trim()}>
            {askIsQuestion ? "اسأل" : "ابحث"}
          </button>
        </form>

        {/* Your workspace — 1.5/1/1: continue-session (promoted, gold), continue-
            reading (progress hairline), recent pins. The last active session is
            promoted regardless of type — it's the likeliest next click. */}
        <div className="qb-home-grid">
          {recentSessions[0] ? (
            <button
              type="button"
              className="qb-home-gridcard promoted"
              onClick={() => {
                queueStudioOpenSession(recentSessions[0].id);
                setMode("studio");
              }}
              title={recentSessions[0].title}
            >
              <span className="eyebrow">
                <Icon name="sparkles" size={13} /> تابِع من حيث توقّفت
              </span>
              <span className="lead">{recentSessions[0].title}</span>
              <span className="meta">
                {recentSessions[0].mode === "tafssir" ? "قراءة تفسيرية" : "القرآن وحدَه"} ·{" "}
                {formatNumber(recentSessions[0].message_count)} رسالة
              </span>
              <span className="cta">تابِع الجلسة ←</span>
            </button>
          ) : (
            <button
              type="button"
              className="qb-home-gridcard promoted"
              onClick={() => setMode("studio")}
            >
              <span className="eyebrow">
                <Icon name="sparkles" size={13} /> ابدأ جلسة دراسة
              </span>
              <span className="lead">اسأل سؤالاً موجَّهاً في المعاني</span>
              <span className="meta">جواب مستند على القرآن، مع شواهده</span>
              <span className="cta">افتح الاستوديو ←</span>
            </button>
          )}

          <button type="button" className="qb-home-gridcard" onClick={() => setMode("reading")}>
            <span className="eyebrow">تابع القراءة</span>
            <span className="lead sm">
              {lastPage ? (
                <>
                  {lastSurah ? <>سورة {lastSurah} · </> : null}صفحة {formatNumber(lastPage)}
                </>
              ) : (
                <>سورة الفاتحة</>
              )}
            </span>
            <span className="hairline" aria-hidden>
              <span style={{ width: `${Math.min(100, Math.round(((lastPage ?? 1) / 604) * 100))}%` }} />
            </span>
          </button>

          <button type="button" className="qb-home-gridcard" onClick={() => setMode("notebook")}>
            <span className="eyebrow">
              مثبَّتات حديثة{savedCount ? <> · {formatNumber(savedCount)}</> : null}
            </span>
            <span className="lead sm">
              {savedCount ? `${formatNumber(savedCount)} آية مُثبَّتة في الدفتر` : "لا مثبَّتات بعد"}
            </span>
            <span className="cta">افتح الدفتر ←</span>
          </button>
        </div>

        {/* Saved muṣḥaf pages — reopen the reader exactly where you bookmarked. */}
        {savedPages.length > 0 ? (
          <div className="qb-home-saved">
            <div className="lbl">صفحات محفوظة</div>
            <div className="chips">
              {savedPages.slice(0, 10).map((entry) => (
                <button
                  key={`${entry.mushaf_id}-${entry.page}`}
                  type="button"
                  className="chip"
                  onClick={() => openSavedPage(entry)}
                  title={`${entry.surah ?? "المصحف"} · صفحة ${entry.page}`}
                >
                  <Icon name="bookmarkFilled" size={12} />
                  <span className="s">{entry.surah ?? "المصحف"}</span>
                  <span className="p">صفحة {formatNumber(entry.page)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

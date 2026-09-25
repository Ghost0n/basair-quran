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
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";
const LAST_SURAH_KEY = "qbasair.mushaf.lastSurah";

// A small rotating set of well-known āyāt — the page's centerpiece. The text is
// shown exactly as in the muṣḥaf; only the reference number follows the numeral
// preference. Any addition must be exact Uthmani text, 2–6 words, owner-reviewed.
// i18n-ignore — Quran text and its surah names stay as they are.
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
const LANDED_KEY = "qb.landed";

export function HomeScreen() {
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const { actions } = useWorkspace();
  const { preferences, ready } = usePreferences();

  // Returning readers land in the reader: the first Home of a browser session
  // with a saved position forwards to «القراءة» (which resumes there). Home is
  // still one tap away (rail brand / tab bar) and never redirects twice.
  const hasPosition = Boolean(preferences.last_position?.ayah_id || preferences.last_position?.page);
  useEffect(() => {
    if (!ready) return;
    try {
      if (window.sessionStorage.getItem(LANDED_KEY)) return;
      window.sessionStorage.setItem(LANDED_KEY, "1");
    } catch {
      return; // no sessionStorage: never redirect (can't guarantee "only once")
    }
    if (hasPosition) setMode("reading", { replace: true });
  }, [ready, hasPosition, setMode]);
  const mushaf = useMushaf();
  const savedPages = preferences.saved_pages ?? [];

  function openSavedPage(entry: SavedPageEntry) {
    void mushaf.loadPage(entry.mushaf_id || DEFAULT_MUSHAF_ID, entry.page, { persist: true });
    setMode("reading");
  }

  const [ask, setAsk] = useState("");
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [lastSurah, setLastSurah] = useState<string | null>(null);
  const [ayahIndex, setAyahIndex] = useState(0);
  // The account's saved position (what the reader resumes at) wins over this
  // device's last page.
  const resumePage = preferences.last_position?.page ?? lastPage;
  const resumeAyah = preferences.last_position?.page ? preferences.last_position?.ayah ?? null : null;
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
            {t("أهلاً بعودتك،")} <strong>{displayName}</strong>
          </div>
        ) : null}

        {/* The verse holds the seat of honor; the brand is a whisper above it.
            No aria-live: a forever-rotating announcement is screen-reader noise —
            the verse stays ordinary readable (and selectable) text. */}
        <header className="qb-home-ayah-hero">
          <span className="kicker">{t("بَصَائِر")}</span>
          <p key={ayahIndex} className="ayah-text">
            {ayah.text}
          </p>
          <span className="ayah-ref">
            {ayah.surah}: {formatNumber(ayah.ayah)}
          </span>
        </header>

        <form className="qb-home-ask" onSubmit={submitAsk} role="search">
          <Icon name="sparkles" size={18} />
          <input
            type="text"
            value={ask}
            onChange={(event) => setAsk(event.target.value)}
            placeholder={t("اسأل سؤالاً… أو اكتب جذراً/كلمة للبحث")}
            aria-label={t("اسأل سؤالاً أو ابحث في القرآن")}
            dir="auto"
          />
          <button type="submit" disabled={!ask.trim()}>
            {askIsQuestion ? t("اسأل") : t("ابحث")}
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
                <Icon name="sparkles" size={13} /> {t("تابِع من حيث توقّفت")}
              </span>
              <span className="lead">{recentSessions[0].title}</span>
              <span className="meta">
                {recentSessions[0].mode === "tafssir" ? t("قراءة تفسيرية") : t("القرآن وحدَه")} ·{" "}
                {tn("{0} رسالة", recentSessions[0].message_count, { 0: formatNumber(recentSessions[0].message_count) })}
              </span>
              <span className="cta">{t("تابِع الجلسة ←")}</span>
            </button>
          ) : (
            <button
              type="button"
              className="qb-home-gridcard promoted"
              onClick={() => setMode("studio")}
            >
              <span className="eyebrow">
                <Icon name="sparkles" size={13} /> {t("ابدأ جلسة دراسة")}
              </span>
              <span className="lead">{t("اسأل سؤالاً موجَّهاً في المعاني")}</span>
              <span className="meta">{t("جواب مستند على القرآن، مع شواهده")}</span>
              <span className="cta">{t("افتح الاستوديو ←")}</span>
            </button>
          )}

          <button type="button" className="qb-home-gridcard" onClick={() => setMode("reading")}>
            <span className="eyebrow">{resumePage ? t("تابع القراءة") : t("ابدأ القراءة")}</span>
            <span className="lead sm">
              {resumePage ? (
                <>
                  {lastSurah && resumePage === lastPage ? <>{t("سورة {0}", { 0: lastSurah })}{t("، ")}</> : null}
                  {t("صفحة {0}", { 0: formatNumber(resumePage) })}
                </>
              ) : (
                <>{t("سورة الفاتحة")}</>
              )}
            </span>
            {resumeAyah ? <span className="meta">{t("عند الآية")} {formatNumber(resumeAyah)}</span> : null}
            {resumePage ? (
              <span className="hairline" aria-hidden>
                <span style={{ width: `${Math.min(100, Math.round((resumePage / 604) * 100))}%` }} />
              </span>
            ) : null}
            <span className="cta">{resumePage ? t("تابِع ←") : t("افتح المصحف ←")}</span>
          </button>

          <button type="button" className="qb-home-gridcard" onClick={() => setMode("notebook")}>
            <span className="eyebrow">
              {t("مثبَّتات حديثة")}{savedCount ? <> ({formatNumber(savedCount)})</> : null}
            </span>
            <span className="lead sm">
              {savedCount ? tn("{0} آية مُثبَّتة في الدفتر", savedCount, { 0: formatNumber(savedCount) }) : t("لا مثبَّتات بعد")}
            </span>
            <span className="cta">{t("افتح الدفتر ←")}</span>
          </button>
        </div>

        {/* Saved muṣḥaf pages — reopen the reader exactly where you bookmarked. */}
        {savedPages.length > 0 ? (
          <div className="qb-home-saved">
            <div className="lbl">{t("صفحات محفوظة")}</div>
            <div className="chips">
              {savedPages.slice(0, 10).map((entry) => (
                <button
                  key={`${entry.mushaf_id}-${entry.page}`}
                  type="button"
                  className="chip"
                  onClick={() => openSavedPage(entry)}
                  title={t("{0} · صفحة {1}", { 0: entry.surah ?? t("المصحف"), 1: entry.page })}
                >
                  <Icon name="bookmarkFilled" size={12} />
                  <span className="s">{entry.surah ?? t("المصحف")}</span>
                  <span className="p">{t("صفحة")} {formatNumber(entry.page)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

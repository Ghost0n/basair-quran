"use client";

import "./home.css";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ResearchSessionSummary, SavedPageEntry, SearchMode } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { useAuthSession } from "@/lib/auth-session-context";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { queueStudioAsk, queueStudioOpenSession } from "@/lib/studio-prefill";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { ThemeButton } from "@/features/shell/top-bar";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { boardUrl, readLastBoard, type LastBoard } from "@/features/board/last-board";
import "@/features/themes/themes.css";
import { relativeAge } from "@/features/companions/use-companions";

import { HomeAsk } from "./home-ask";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";

/** Card buttons read as plain words — no trailing «←» / «→» (translations keep theirs). */
function noArrow(label: string): string {
  return label.replace(/\s*[←→]\s*$/u, "");
}
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
  const { state: workspace, actions } = useWorkspace();
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


  const router = useRouter();
  const [lastBoard, setLastBoard] = useState<LastBoard | null>(null);
  useEffect(() => setLastBoard(readLastBoard()), []);
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

  // «اسأل» opens a new Studio session with the prompt; «ابحث» (or a suggestion)
  // runs a Quran search and lands on the results (see HomeAsk).
  function askStudio(value: string) {
    queueStudioAsk(value);
    setMode("studio");
  }

  function searchQuran(value: string, searchMode: SearchMode = "exact") {
    // The shared workspace runs it (same path as the command bar's chips).
    actions.runQuickExample({ query: value, mode: searchMode });
    setMode("search");
  }

  const ayah = ROTATING_AYAHS[ayahIndex];

  // «تابِع…» cards, most recent activity first: the Studio session, the
  // reading position, the board. The first one is promoted.
  const session = recentSessions[0] ?? null;
  const continueCards: { key: string; at: number; render: (promoted: boolean) => ReactNode }[] = [];
  if (session) {
    continueCards.push({
      key: "session",
      at: session.updated_at,
      render: (promoted) => (
        <button
          type="button"
          className={`qb-home-gridcard${promoted ? " promoted" : ""}`}
          onClick={() => {
            queueStudioOpenSession(session.id);
            setMode("studio");
          }}
          title={session.title}
        >
          <span className="eyebrow">
            <Icon name="sparkles" size={13} /> {t("تابِع الجلسة")}
          </span>
          <span className={`lead${promoted ? "" : " sm"}`}>{session.title}</span>
          <span className="meta">
            {session.mode === "tafssir" ? t("قراءة تفسيرية") : t("القرآن وحدَه")} ·{" "}
            {tn("{0} رسالة", session.message_count, { 0: formatNumber(session.message_count) })}
          </span>
          <span className="cta">{noArrow(t("تابِع الجلسة ←"))}</span>
        </button>
      ),
    });
  }
  continueCards.push({
    key: "reading",
    at: resumePage ? preferences.last_position?.updated_at ?? 1 : 0,
    render: (promoted) => (
      <button type="button" className={`qb-home-gridcard${promoted ? " promoted" : ""}`} onClick={() => setMode("reading")}>
        <span className="eyebrow">
          <Icon name="book" size={13} /> {resumePage ? t("تابع القراءة") : t("ابدأ القراءة")}
        </span>
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
        <span className="cta">{noArrow(resumePage ? t("تابِع ←") : t("افتح المصحف ←"))}</span>
      </button>
    ),
  });
  if (lastBoard) {
    continueCards.push({
      key: "board",
      at: lastBoard.at ?? 1,
      render: (promoted) => (
        <button
          type="button"
          className={`qb-home-gridcard board${promoted ? " promoted" : ""}`}
          data-hl={lastBoard.color}
          onClick={() => router.push(boardUrl(lastBoard.theme, lastBoard.board))}
        >
          <span className="eyebrow">
            <Icon name="graph" size={13} /> {t("تابِع اللوحة")}
          </span>
          <span className="lead sm">{lastBoard.name}</span>
          <span className="meta">
            <span className="dot" aria-hidden /> {lastBoard.themeName}
          </span>
          <span className="cta">{noArrow(t("افتح اللوحة ←"))}</span>
        </button>
      ),
    });
  }
  continueCards.sort((a, b) => b.at - a.at);

  const greetingName = displayName?.trim();

  return (
    <div className="qb-home">
      <div className="qb-home-inner">
        {/* Phones have no top bar: the theme switch sits beside the greeting. */}
        <div className="qb-home-top">
          <div className="qb-home-greeting">
            {greetingName ? (
              <>
                {t("أهلاً،")} <strong>{greetingName}</strong>
              </>
            ) : (
              t("أهلاً بك")
            )}
          </div>
          <ThemeButton className="qb-icon-btn qb-home-theme" />
        </div>

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

        <HomeAsk
          mushaf={workspace.selectedMushaf}
          examples={workspace.quickExamples}
          onSearch={searchQuran}
          onAsk={askStudio}
        />

        {/* Saved muṣḥaf pages first — the reader's own bookmarks are the way in. */}
        <section className="qb-home-pages" aria-label={t("صفحات محفوظة")}>
          <div className="qb-home-section-h">
            <Icon name="bookmarkFilled" size={14} /> {t("صفحات محفوظة")}
          </div>
          {savedPages.length > 0 ? (
            <div className="rail">
              {savedPages.slice(0, 12).map((entry) => (
                <button key={`${entry.mushaf_id}-${entry.page}`} type="button" className="qb-home-page" onClick={() => openSavedPage(entry)}>
                  <span className="ribbon" aria-hidden>
                    <svg viewBox="0 0 16 24" width="12" height="18">
                      <path d="M1 0h14v22l-7-5-7 5z" />
                    </svg>
                  </span>
                  <span className="surah">{entry.surah ?? t("المصحف")}</span>
                  <span className="page">{t("صفحة {0}", { 0: formatNumber(entry.page) })}</span>
                  {entry.saved_at ? <span className="age">{relativeAge(entry.saved_at, formatNumber)}</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">{t("احفظ صفحة من القراءة (علامة الحفظ في شريط القارئ) لتجدها هنا.")}</p>
          )}
        </section>

        <div className="qb-home-grid">
          {continueCards.map((card, index) => (
            <Fragment key={card.key}>{card.render(index === 0)}</Fragment>
          ))}
          <button type="button" className="qb-home-gridcard" onClick={() => setMode("notebook", { resume: true })}>
            <span className="eyebrow">
              <Icon name="notebook" size={13} /> {t("مثبَّتات حديثة")}
              {savedCount ? <span className="count"> ({formatNumber(savedCount)})</span> : null}
            </span>
            <span className="lead sm">
              {savedCount ? tn("{0} آية مُثبَّتة في الدفتر", savedCount, { 0: formatNumber(savedCount) }) : t("لا مثبَّتات بعد")}
            </span>
            <span className="cta">{noArrow(t("افتح الدفتر ←"))}</span>
          </button>
          {!session ? (
            <button type="button" className="qb-home-gridcard" onClick={() => setMode("studio")}>
              <span className="eyebrow">
                <Icon name="sparkles" size={13} /> {t("ابدأ جلسة دراسة")}
              </span>
              <span className="lead sm">{t("اسأل سؤالاً موجَّهاً في المعاني")}</span>
              <span className="cta">{noArrow(t("افتح الاستوديو ←"))}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

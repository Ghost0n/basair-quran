"use client";

import "./home.css";

import { useEffect, useState, type FormEvent } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ResearchSessionSummary } from "@q-basair/shared";

import { BrandMarkRich } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { looksLikeQuestion, queueStudioAsk } from "@/lib/studio-prefill";
import { useShellMode, type ShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";
const LAST_SURAH_KEY = "qbasair.mushaf.lastSurah";

type QuickCard = {
  mode: ShellMode;
  icon: IconName;
  title: string;
  hint: string;
};

const QUICK_CARDS: QuickCard[] = [
  { mode: "reading", icon: "book", title: "القراءة", hint: "اقرأ المصحف صفحةً صفحة" },
  { mode: "search", icon: "search", title: "البحث", hint: "ابحث في الجذور والكلمات" },
  { mode: "studio", icon: "feather", title: "الدراسة", hint: "بحث موجَّه في المعاني" },
];

// A small rotating set of well-known āyāt for the "verse of the moment". The
// text is shown exactly as in the muṣḥaf; only the reference number follows the
// numeral preference.
const ROTATING_AYAHS: { text: string; surah: string; ayah: number }[] = [
  { text: "ٱللَّهُ نُورُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ", surah: "النور", ayah: 35 },
  { text: "وَقُل رَّبِّ زِدْنِى عِلْمًا", surah: "طه", ayah: 114 },
  { text: "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا", surah: "الشرح", ayah: 6 },
  { text: "فَٱذْكُرُونِىٓ أَذْكُرْكُمْ", surah: "البقرة", ayah: 152 },
  { text: "وَبَشِّرِ ٱلصَّٰبِرِينَ", surah: "البقرة", ayah: 155 },
];

const ROTATE_MS = 9000;

/**
 * HomeScreen — the default landing: brand hero, a prominent natural-language
 * "ask" bar that hands off to the Studio, quick-entry cards, a continue-reading
 * shortcut to the last page, and a rotating āyah. One click reaches every room.
 */
export function HomeScreen() {
  const { setMode } = useShellMode();
  const { preferences } = usePreferences();
  const formatNumber = useNumerals();
  const { actions } = useWorkspace();

  const [ask, setAsk] = useState("");
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [lastSurah, setLastSurah] = useState<string | null>(null);
  const [ayahIndex, setAyahIndex] = useState(0);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [rootsCount, setRootsCount] = useState<number | null>(null);
  const [recentSessions, setRecentSessions] = useState<ResearchSessionSummary[]>([]);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(LAST_PAGE_KEY));
      if (Number.isFinite(stored) && stored >= 1) setLastPage(stored);
      setLastSurah(window.localStorage.getItem(LAST_SURAH_KEY));
    } catch {
      /* no last page — the continue card just won't show */
    }
  }, []);

  // Light desk stats + the latest research sessions. Each source fails silently
  // (the row simply doesn't render) so an unreachable store can't mar the Home.
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([api.getNotebook(), api.getRoots(), api.getSessions()]).then(
      ([notebook, roots, sessions]) => {
        if (cancelled) return;
        if (notebook.status === "fulfilled") setSavedCount(notebook.value.length);
        if (roots.status === "fulfilled") setRootsCount(roots.value.length);
        if (sessions.status === "fulfilled") setRecentSessions(sessions.value.slice(0, 3));
      },
    );
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
  const isLight = preferences.theme === "light";

  return (
    <div className="qb-home">
      <div className="qb-home-inner">
        <header className="qb-home-hero">
          <BrandMarkRich size={96} light={isLight} />
          <h1>بَصَائِر القُرآن</h1>
          <p className="subtitle">غرفة القراءة والبحث الموجَّه في القرآن الكريم</p>
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

        {lastPage ? (
          <button type="button" className="qb-home-continue" onClick={() => setMode("reading")}>
            <Icon name="book" size={16} />
            <span>
              تابع القراءة · {lastSurah ? <>سورة <strong>{lastSurah}</strong> · </> : null}
              صفحة <strong>{formatNumber(lastPage)}</strong>
            </span>
            <Icon name="arrowLeft" size={16} />
          </button>
        ) : null}

        {savedCount || rootsCount ? (
          <div className="qb-home-stats" aria-label="إحصاءات المكتبة">
            {savedCount ? (
              <button type="button" className="stat" onClick={() => setMode("notebook")}>
                <Icon name="bookmarkFilled" size={13} />
                <strong>{formatNumber(savedCount)}</strong> آية محفوظة
              </button>
            ) : null}
            {rootsCount ? (
              <button type="button" className="stat" onClick={() => setMode("roots")}>
                <Icon name="tree" size={13} />
                <strong>{formatNumber(rootsCount)}</strong> جذر مُتابَع
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="qb-home-cards">
          {QUICK_CARDS.map((card) => (
            <button
              key={card.mode}
              type="button"
              className="qb-home-card"
              onClick={() => setMode(card.mode)}
            >
              <span className="ico">
                <Icon name={card.icon} size={22} />
              </span>
              <span className="title">{card.title}</span>
              <span className="hint">{card.hint}</span>
            </button>
          ))}
        </div>

        {recentSessions.length > 0 ? (
          <div className="qb-home-recent">
            <div className="head">
              <span className="lbl">جلسات بحث أخيرة</span>
              <button type="button" className="all" onClick={() => setMode("history")}>
                الكل
              </button>
            </div>
            {recentSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="row"
                onClick={() => setMode("history")}
                title={session.title}
              >
                <Icon name="sparkles" size={13} />
                <span className="title">{session.title}</span>
                <span className={`mode ${session.mode}`}>
                  {session.mode === "tafssir" ? "تفسيرية" : "القرآن وحدَه"}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="qb-home-ayah" aria-live="polite">
          <p key={ayahIndex} className="ayah-text">
            {ayah.text}
          </p>
          <span className="ayah-ref">
            {ayah.surah} · {formatNumber(ayah.ayah)}
          </span>
        </div>
      </div>
    </div>
  );
}

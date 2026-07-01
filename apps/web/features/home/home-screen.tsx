"use client";

import "./home.css";

import { useEffect, useState, type FormEvent } from "react";

import { BrandMarkRich } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { queueStudioAsk } from "@/lib/studio-prefill";
import { useShellMode, type ShellMode } from "@/features/shell/mode-context";

const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";

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

  const [ask, setAsk] = useState("");
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [ayahIndex, setAyahIndex] = useState(0);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(LAST_PAGE_KEY));
      if (Number.isFinite(stored) && stored >= 1) setLastPage(stored);
    } catch {
      /* no last page — the continue card just won't show */
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setAyahIndex((index) => (index + 1) % ROTATING_AYAHS.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  function submitAsk(event: FormEvent) {
    event.preventDefault();
    const question = ask.trim();
    if (!question) return;
    queueStudioAsk(question);
    setAsk("");
    setMode("studio");
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
            placeholder="اسأل سؤالاً عن معنى أو موضوع في القرآن…"
            aria-label="اسأل سؤالاً عن القرآن"
            dir="rtl"
          />
          <button type="submit" disabled={!ask.trim()}>
            اسأل
          </button>
        </form>

        {lastPage ? (
          <button type="button" className="qb-home-continue" onClick={() => setMode("reading")}>
            <Icon name="book" size={16} />
            <span>
              تابع القراءة · صفحة <strong>{formatNumber(lastPage)}</strong>
            </span>
            <Icon name="arrowLeft" size={16} />
          </button>
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

"use client";

import "./home.css";
import "@/features/shell/worlds.css";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { HomeSectionId, RecentPage, RecentSearch } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { relativeAge } from "@/features/companions/use-companions";
import { useMushaf } from "@/features/reading/mushaf-context";
import { requestReaderResume } from "@/features/reading/reader-entry";
import { useRecitation } from "@/features/recitation/recitation-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { useAuthSession } from "@/lib/auth-session-context";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { useRecents } from "@/lib/use-recents";

import { AccountSheet } from "./account-sheet";
import { WebHome } from "./home-web";
import { greetingFor, readLastVisit, rememberVisit } from "./greeting";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";
const LAST_SURAH_KEY = "qbasair.mushaf.lastSurah";

// A small rotating set of well-known āyāt — the wide Home's centerpiece. The
// text is shown exactly as in the muṣḥaf; only the reference number follows the
// numeral preference. Any addition must be exact Uthmani text, 2–6 words,
// owner-reviewed.
// i18n-ignore — Quran text and its surah names stay as they are.
const ROTATING_AYAHS: {
  text: string;
  surah: string;
  surahNo: number;
  ayah: number;
}[] = [
  {
    text: "ٱللَّهُ نُورُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ",
    surah: "النور",
    surahNo: 24,
    ayah: 35,
  },
  { text: "وَقُل رَّبِّ زِدْنِى عِلْمًا", surah: "طه", surahNo: 20, ayah: 114 },
  {
    text: "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا",
    surah: "الشرح",
    surahNo: 94,
    ayah: 6,
  },
  {
    text: "فَٱذْكُرُونِىٓ أَذْكُرْكُمْ",
    surah: "البقرة",
    surahNo: 2,
    ayah: 152,
  },
  { text: "وَبَشِّرِ ٱلصَّٰبِرِينَ", surah: "البقرة", surahNo: 2, ayah: 155 },
];

const ROTATE_MS = 9000;

type Card = {
  eyebrow: string;
  title: string;
  meta?: string;
  action: string;
  onAction: () => void;
  /** Reading: listen from where the reader stopped. */
  onListen?: () => void;
};

/**
 * Home — one screen at every width (the web design, home-web.tsx): the
 * rotating verse, the one thing to continue (a gold button), the last places
 * read and the last searches run. No shortcuts to other screens: the
 * navigation bar opens them.
 */
export function HomeScreen() {
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const { preferences, ready } = usePreferences();
  const mushaf = useMushaf();
  const recitation = useRecitation();
  const { user } = useAuthSession();
  const { actions } = useWorkspace();
  const recents = useRecents();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountBtn = useRef<HTMLButtonElement>(null);
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [lastSurah, setLastSurah] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [lastVisit] = useState(readLastVisit);
  const [ayahIndex, setAyahIndex] = useState(0);

  // The app always opens on Home (never straight into the reader): «تابع»
  // resumes the last reading from here.
  const position = preferences.last_position;
  useEffect(() => {
    rememberVisit();
    try {
      const stored = Number(window.localStorage.getItem(LAST_PAGE_KEY));
      if (Number.isFinite(stored) && stored >= 1) setLastPage(stored);
      setLastSurah(window.localStorage.getItem(LAST_SURAH_KEY));
    } catch {
      /* no last page: the reading card offers a start */
    }
    // A study session makes the reader a returning one (the greeting).
    let cancelled = false;
    api.getSessions().then(
      (list) => !cancelled && setHasSession(list.length > 0),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The verse: a random one on arrival (client-side, so no hydration
  // mismatch), then the next every few seconds.
  useEffect(() => {
    setAyahIndex(Math.floor(Math.random() * ROTATING_AYAHS.length));
    const timer = window.setInterval(() => setAyahIndex((index) => (index + 1) % ROTATING_AYAHS.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const page = position?.page ?? lastPage;
  const newUser = !page && !hasSession && !recents.searches.length;
  const greeting = greetingFor({
    name: user?.name?.trim() || null,
    newUser,
    lastVisit,
    formatNumber,
  });

  const reading: Card = page
    ? {
        eyebrow: t("تابع القراءة"),
        title: lastSurah && (!position?.page || position.page === lastPage) ? lastSurah : t("صفحة {0}", { 0: formatNumber(page) }),
        meta: [t("صفحة {0}", { 0: formatNumber(page) }), position?.updated_at ? relativeAge(position.updated_at, formatNumber) : null]
          .filter(Boolean)
          .join(" · "),
        action: t("تابع"),
        onAction: () => {
          requestReaderResume();
          setMode("reading");
        },
        onListen:
          position?.surah && position?.ayah
            ? () => {
                requestReaderResume();
                recitation.playAyah(position.surah as number, position.ayah as number);
                setMode("reading");
              }
            : undefined,
      }
    : {
        eyebrow: t("ابدأ القراءة"),
        title: t("الفَاتِحَة"),
        meta: t("من أول المصحف"),
        action: t("ابدأ"),
        onAction: () => {
          void mushaf.loadPage(DEFAULT_MUSHAF_ID, 1, { persist: true });
          setMode("reading");
        },
      };

  // The last places read (the one «تابع» already offers isn't repeated)
  // and the last searches, newest first.
  const recentPages = recents.pages.filter((item) => !(item.page === page && item.mushaf_id === (position?.mushaf_id ?? item.mushaf_id)));
  const openPage = (item: RecentPage) => {
    void mushaf.loadPage(item.mushaf_id, item.page, { persist: true });
    setMode("reading");
  };
  const runSearch = (item: RecentSearch) => {
    actions.runQuickExample({ query: item.query, mode: item.mode });
    setMode("search");
  };
  const pageLabel = (item: RecentPage) => t("صفحة {0}", { 0: formatNumber(item.page) });
  const searchMode = (item: RecentSearch) => (item.mode === "root" ? t("جذر") : t("كلمة أو عبارة"));

  const ayah = ROTATING_AYAHS[ayahIndex];
  // The sections hidden in Settings («الرئيسية»).
  const hiddenSections = preferences.home_hidden ?? [];
  const shows = (id: HomeSectionId) => !hiddenSections.includes(id);
  const pagesShown = shows("recent_pages") ? recentPages : [];
  const searchesShown = shows("recent_searches") ? recents.searches : [];

  // Account and settings: on a phone the rail (and its account menu) is gone,
  // so Home's corner opens them as a sheet.
  const accountButton = (
    <button
      ref={accountBtn}
      type="button"
      className="qb-home-account"
      onClick={() => setAccountOpen(true)}
      aria-haspopup="dialog"
      aria-label={t("الحساب والإعدادات")}
    >
      <Icon name="user" size={20} />
    </button>
  );
  const accountSheet =
    accountOpen && typeof document !== "undefined"
      ? createPortal(
          <AccountSheet
            onClose={() => {
              setAccountOpen(false);
              accountBtn.current?.focus({ preventScroll: true });
            }}
          />,
          document.body,
        )
      : null;

  return (
    <WebHome
      corner={accountButton}
      overlay={accountSheet}
      formatNumber={formatNumber}
      greeting={shows("greeting") ? { line: greeting.line, sub: greeting.sub } : null}
      verse={
        shows("verse")
          ? {
              text: ayah.text,
              surah: ayah.surah,
              ayah: ayah.ayah,
              key: ayahIndex,
              onRead: () => {
                void mushaf.loadBySurah(DEFAULT_MUSHAF_ID, ayah.surahNo, ayah.ayah);
                setMode("reading");
              },
              onListen: () => {
                void mushaf.loadBySurah(DEFAULT_MUSHAF_ID, ayah.surahNo, ayah.ayah);
                recitation.playAyah(ayah.surahNo, ayah.ayah);
                setMode("reading");
              },
            }
          : null
      }
      reading={
        shows("continue")
          ? {
              eyebrow: reading.eyebrow,
              title: reading.title,
              meta: reading.meta,
              page: page ?? null,
              surah: position?.surah ?? null,
              action: reading.action,
              onAction: reading.onAction,
              onListen: reading.onListen,
            }
          : null
      }
      lists={[
        {
          id: "recent_pages",
          title: t("الصفحات الأخيرة"),
          rows: pagesShown.map((item) => ({
            id: `${item.mushaf_id}:${item.page}`,
            icon: "book" as const,
            label: pageLabel(item),
            sub: [item.surah, item.at ? relativeAge(item.at, formatNumber) : null].filter(Boolean).join(" · "),
            onClick: () => openPage(item),
          })),
        },
        {
          id: "recent_searches",
          title: t("عمليات البحث الأخيرة"),
          rows: searchesShown.map((item) => ({
            id: `${item.mode}:${item.query}`,
            icon: "search" as const,
            label: item.query,
            sub: searchMode(item),
            onClick: () => runSearch(item),
          })),
        },
      ].filter((list) => list.rows.length)}
    />
  );
}

"use client";

import "./home.css";
import "@/features/shell/worlds.css";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { HomeSectionId, ResearchSessionSummary } from "@q-basair/shared";

import { Icon, type IconName } from "@/components/icon";
import { relativeAge } from "@/features/companions/use-companions";
import { useMushaf } from "@/features/reading/mushaf-context";
import { requestReaderResume, requestReaderSheet } from "@/features/reading/reader-entry";
import { useRecitation } from "@/features/recitation/recitation-context";
import { useShellMode } from "@/features/shell/mode-context";
import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { useAuthSession } from "@/lib/auth-session-context";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { queueStudioOpenSession } from "@/lib/studio-prefill";
import { useWebDesign } from "@/lib/use-web-design";

import { AccountSheet } from "./account-sheet";
import { WebHome } from "./home-web";
import { greetingFor, readLastVisit, rememberVisit } from "./greeting";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";
const LAST_SURAH_KEY = "qbasair.mushaf.lastSurah";
export const COMMUNITY_SEEN_KEY = "qb.community.seen";

// A small rotating set of well-known āyāt — the wide Home's centerpiece. The
// text is shown exactly as in the muṣḥaf; only the reference number follows the
// numeral preference. Any addition must be exact Uthmani text, 2–6 words,
// owner-reviewed.
// i18n-ignore — Quran text and its surah names stay as they are.
const ROTATING_AYAHS: { text: string; surah: string; surahNo: number; ayah: number }[] = [
  { text: "ٱللَّهُ نُورُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ", surah: "النور", surahNo: 24, ayah: 35 },
  { text: "وَقُل رَّبِّ زِدْنِى عِلْمًا", surah: "طه", surahNo: 20, ayah: 114 },
  { text: "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا", surah: "الشرح", surahNo: 94, ayah: 6 },
  { text: "فَٱذْكُرُونِىٓ أَذْكُرْكُمْ", surah: "البقرة", surahNo: 2, ayah: 152 },
  { text: "وَبَشِّرِ ٱلصَّٰبِرِينَ", surah: "البقرة", surahNo: 2, ayah: 155 },
];

const ROTATE_MS = 9000;

type Card = {
  eyebrow: string;
  title: string;
  /** A longer title (a question) reads smaller. */
  small?: boolean;
  meta?: string;
  action: string;
  onAction: () => void;
  /** Reading: listen from where the reader stopped. */
  onListen?: () => void;
};

type Shortcut = { id: HomeSectionId; icon: IconName; label: string; sub?: string; onClick: () => void };

/**
 * Home — one screen, laid out for the hand that holds it.
 *
 * On a phone the upper part is for looking (brand, greeting) and the actions
 * stack from the bottom up, inside the thumb's reach above the tab bar: the
 * one thing to continue (a gold button), four labelled shortcuts, and the
 * search field last (docs/mobile-ergonomics.md).
 *
 * On a wide screen a rotating āyah holds the centre, as it always has, with the
 * same continue card, shortcuts and search beneath it. Both share one tree and
 * CSS picks the arrangement (home.css), so nothing swaps after hydration.
 */
export function HomeScreen() {
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const { preferences, ready } = usePreferences();
  const mushaf = useMushaf();
  const recitation = useRecitation();
  const { user } = useAuthSession();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountBtn = useRef<HTMLButtonElement>(null);
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [lastSurah, setLastSurah] = useState<string | null>(null);
  const [session, setSession] = useState<ResearchSessionSummary | null>(null);
  const [newPosts, setNewPosts] = useState(0);
  const [lastVisit] = useState(readLastVisit);
  const [ayahIndex, setAyahIndex] = useState(0);
  const web = useWebDesign();

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
    let cancelled = false;
    api.getSessions().then(
      (list) => !cancelled && setSession(list[0] ?? null),
      () => undefined,
    );
    // New community posts since the last visit there (online only; silent otherwise).
    let seen = 0;
    try {
      seen = Number(window.localStorage.getItem(COMMUNITY_SEEN_KEY)) || 0;
    } catch {
      /* never seen */
    }
    if (seen) {
      api.getFeed({ limit: 20 }).then(
        (page) => !cancelled && setNewPosts(page.posts.filter((post) => (post.published_at ?? post.updated_at) > seen).length),
        () => undefined,
      );
    }
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
  const newUser = !page && !session;
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

  function openReaderSheet(tab: "surah" | "saved") {
    requestReaderSheet(tab);
    setMode("reading");
  }

  const shortcuts: Shortcut[] = [
    // Shortcuts into the reader's own «انتقل» sheet (not pages of their own).
    { id: "index", icon: "menu", label: t("الفهرس"), sub: t("كل السور"), onClick: () => openReaderSheet("surah") },
    { id: "saved", icon: "bookmark", label: t("المحفوظة"), sub: t("الصفحات المحفوظة"), onClick: () => openReaderSheet("saved") },
    // The last study session to resume, or a new one.
    session
      ? {
          id: "study",
          icon: "sparkles",
          label: t("تابع دراستك"),
          sub: session.title,
          onClick: () => {
            queueStudioOpenSession(session.id);
            setMode("studio");
          },
        }
      : { id: "study", icon: "sparkles", label: t("الدراسة"), sub: t("جلسة جديدة"), onClick: () => setMode("studio") },
    {
      id: "community",
      icon: "users",
      label: t("المجتمع"),
      sub: newPosts > 0 ? tn("{0} منشور جديد", newPosts, { 0: formatNumber(newPosts) }) : t("ما يشاركه الباحثون"),
      onClick: () => setMode("community", { params: { tab: null } }),
    },
  ];

  const ayah = ROTATING_AYAHS[ayahIndex];
  // The sections hidden in Settings («الرئيسية»).
  const hiddenSections = preferences.home_hidden ?? [];
  const shows = (id: HomeSectionId) => !hiddenSections.includes(id);
  const tiles = shortcuts.filter((item) => shows(item.id));

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

  // The web design (desktop web): same data and actions, its own layout (home-web.tsx).
  if (web) {
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
        rows={tiles.map((item) => ({ ...item, dot: item.id === "community" && newPosts > 0 }))}
      />
    );
  }

  return (
    <div className="qb-home">
      {/* Phones: the greeting opens the screen, beside the account button
          (the brand is the Home tab itself). */}
      <header className="qb-home-top">
        {shows("greeting") ? (
          <div className="qb-home-greeting">
            <h1>{greeting.line}</h1>
            {greeting.sub ? <p>{greeting.sub}</p> : null}
          </div>
        ) : null}
        {/* Phones only: the desktop rail carries the account menu. */}
        {accountButton}
      </header>

      {/* Wide screens: the verse holds the seat of honour. No aria-live — a
          forever-rotating announcement is screen-reader noise; the verse stays
          ordinary readable (and selectable) text. */}
      {shows("verse") ? (
        <figure className="qb-home-verse">
          <p key={ayahIndex} className="ayah-text">
            {ayah.text}
          </p>
          <figcaption className="ayah-ref">
            {ayah.surah}: {formatNumber(ayah.ayah)}
          </figcaption>
        </figure>
      ) : null}

      {/* Everything you can do from here, within reach. */}
      <div className="qb-home-reach">
        {shows("continue") ? (
          <section className="qb-home-continue" aria-label={reading.eyebrow}>
            <span className="eyebrow">
              <Icon name="book" size={15} />
              {reading.eyebrow}
            </span>
            <div className="row">
              <div className="txt">
                <h2 className={reading.small ? "sm" : undefined}>{reading.title}</h2>
                {reading.meta ? <p>{reading.meta}</p> : null}
              </div>
              {reading.onListen ? (
                <button type="button" className="listen" onClick={reading.onListen} aria-label={t("استمع من حيث توقفت")}>
                  <Icon name="play" size={20} />
                </button>
              ) : null}
            </div>
            <button type="button" className="go" onClick={reading.onAction}>
              {reading.action}
            </button>
          </section>
        ) : null}

        {tiles.length ? (
          <div className={`qb-home-grid${tiles.length % 2 ? " is-odd" : ""}`} style={{ "--tiles": tiles.length } as CSSProperties}>
            {tiles.map((item) => (
              <Tile key={item.id} icon={item.icon} label={item.label} sub={item.sub} onClick={item.onClick}>
                {item.id === "community" && newPosts > 0 ? <i className="dot" aria-hidden="true" /> : null}
              </Tile>
            ))}
          </div>
        ) : null}

        {shows("search") ? (
          <button type="button" className="qb-home-search" onClick={() => setMode("search")}>
            <Icon name="search" size={20} />
            <span>{t("ابحث بكلمة أو جذر، أو اطرح سؤالاً")}</span>
          </button>
        ) : null}
      </div>

      {accountSheet}
    </div>
  );
}

function Tile({
  icon,
  label,
  sub,
  onClick,
  children,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className="qb-home-tile" onClick={onClick}>
      <span className="ico">
        <Icon name={icon} size={20} />
        {children}
      </span>
      <span className="txt">
        <b>{label}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </button>
  );
}

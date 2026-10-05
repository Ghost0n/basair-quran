"use client";

import "./home.css";
import "@/features/shell/worlds.css";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ResearchSessionSummary } from "@q-basair/shared";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { relativeAge } from "@/features/companions/use-companions";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useRecitation } from "@/features/recitation/recitation-context";
import { useShellMode } from "@/features/shell/mode-context";
import { stepWorld, useCurrentWorld, useWorldNavigation, WORLD_ORDER, WORLDS, type WorldId } from "@/features/shell/worlds";
import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { useAuthSession } from "@/lib/auth-session-context";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { queueStudioOpenSession } from "@/lib/studio-prefill";

import { AccountSheet } from "./account-sheet";
import { greetingFor, readLastVisit, rememberVisit } from "./greeting";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const LANDED_KEY = "qb.landed";
const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";
const LAST_SURAH_KEY = "qbasair.mushaf.lastSurah";
export const COMMUNITY_SEEN_KEY = "qb.community.seen";

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

/**
 * Home — the same in every world, with a subtle change per world.
 *
 * Sizes follow importance: the card's title (what you came for) leads, the
 * greeting welcomes, the brand only signs the page (top corner, opposite the
 * account button). The three worlds sit as a deck of cards: the current one in
 * front with one thing to continue, the other two peeking out behind in their
 * colours. Tap a card behind, or swipe the deck, to change world (the coin and
 * the rail follow). A new user sees a simple start on each card.
 */
export function HomeScreen() {
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const { preferences, ready } = usePreferences();
  const mushaf = useMushaf();
  const recitation = useRecitation();
  const { user } = useAuthSession();
  const world = useCurrentWorld();
  const { changeWorld } = useWorldNavigation();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountBtn = useRef<HTMLButtonElement>(null);
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [lastSurah, setLastSurah] = useState<string | null>(null);
  const [session, setSession] = useState<ResearchSessionSummary | null>(null);
  const [newPosts, setNewPosts] = useState(0);
  const [lastVisit] = useState(readLastVisit);
  const [swap, setSwap] = useState(false);
  const deckSwipe = useRef<{ x: number; y: number } | null>(null);

  // Returning readers land in the reader: the first Home of a browser session
  // with a saved position forwards to «القراءة» (which resumes there). Home is
  // still one tap away and never redirects twice.
  const position = preferences.last_position;
  const hasPosition = Boolean(position?.ayah_id || position?.page);
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

  // The deck animates when the world changes (here, from the coin or the rail).
  const previous = useRef(world);
  useEffect(() => {
    if (previous.current === world) return;
    previous.current = world;
    setSwap(true);
    const timer = window.setTimeout(() => setSwap(false), 400);
    return () => window.clearTimeout(timer);
  }, [world]);

  const page = position?.page ?? lastPage;
  const newUser = !page && !session;
  const greeting = greetingFor({
    name: user?.name?.trim() || null,
    newUser,
    lastVisit,
    formatNumber,
  });

  const cards: Record<WorldId, Card> = {
    reading: page
      ? {
          eyebrow: t("تابع القراءة"),
          title: lastSurah && (!position?.page || position.page === lastPage) ? lastSurah : t("صفحة {0}", { 0: formatNumber(page) }),
          meta: [
            t("صفحة {0}", { 0: formatNumber(page) }),
            position?.updated_at ? relativeAge(position.updated_at, formatNumber) : null,
          ]
            .filter(Boolean)
            .join(" · "),
          action: t("تابع"),
          onAction: () => setMode("reading"),
          onListen:
            position?.surah && position?.ayah
              ? () => {
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
        },
    research: session
      ? {
          eyebrow: t("تابع دراستك"),
          title: session.title,
          small: true,
          meta: relativeAge(session.updated_at, formatNumber),
          action: t("تابع الجلسة"),
          onAction: () => {
            queueStudioOpenSession(session.id);
            setMode("studio");
          },
        }
      : {
          eyebrow: t("البحث في القرآن"),
          title: t("ابحث بكلمة أو جذر، أو اطرح سؤالاً"),
          small: true,
          action: t("جرّب"),
          onAction: () => setMode("search"),
        },
    community:
      newPosts > 0
        ? {
            eyebrow: t("جديد المجتمع"),
            title: tn("{0} منشور جديد", newPosts, { 0: formatNumber(newPosts) }),
            meta: t("منذ زيارتك الأخيرة"),
            action: t("اعرض"),
            onAction: () => setMode("community", { params: { tab: null } }),
          }
        : {
            eyebrow: t("المجتمع"),
            title: t("ما يشاركه الباحثون من أبحاث ولوحات"),
            small: true,
            action: t("تصفّح"),
            onAction: () => setMode("community", { params: { tab: null } }),
          },
  };

  const order: WorldId[] = [world, ...WORLD_ORDER.filter((id) => id !== world)];

  function onDeckDown(event: PointerEvent<HTMLDivElement>) {
    deckSwipe.current = { x: event.clientX, y: event.clientY };
  }
  function onDeckUp(event: PointerEvent<HTMLDivElement>) {
    const start = deckSwipe.current;
    deckSwipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 44 && Math.abs(dy) < 40) changeWorld(stepWorld(world, dx < 0 ? 1 : -1), true);
  }

  return (
    <div className="qb-home-deck">
      <div className="qb-home-inner">
        <div className="qb-home-top">
          <span className="qb-brandmini" role="img" aria-label={t("بصائر")}>
            <BrandMark size={34} themed />
            <span className="bname" aria-hidden="true">
              {t("بَصَائِر")}
            </span>
          </span>
          <button
            ref={accountBtn}
            type="button"
            className="qb-home-account"
            onClick={() => setAccountOpen(true)}
            aria-haspopup="dialog"
            aria-label={t("الحساب والإعدادات")}
          >
            <Icon name="user" size={18} />
          </button>
        </div>

        <div className="qb-home-greeting">
          <h1>{greeting.line}</h1>
          {greeting.sub ? <p>{greeting.sub}</p> : null}
        </div>

        <div className="spacer" />

        <div
          className={`qb-deck${swap ? " swap" : ""}`}
          onPointerDown={onDeckDown}
          onPointerUp={onDeckUp}
          onPointerCancel={() => (deckSwipe.current = null)}
        >
          {order
            .map((id, depth) => {
              const card = cards[id];
              const W = WORLDS[id];
              const back = depth > 0;
              return (
                <div
                  key={id}
                  className={`dcard${back ? " back" : ""}`}
                  data-w={id}
                  data-depth={depth}
                  role={back ? "button" : "group"}
                  tabIndex={back ? 0 : undefined}
                  aria-label={back ? W.label : card.eyebrow}
                  onClick={back ? () => changeWorld(id, true) : undefined}
                  onKeyDown={
                    back
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            changeWorld(id, true);
                          }
                        }
                      : undefined
                  }
                  style={{ "--deck-depth": depth } as CSSProperties}
                >
                  <span className="dlabel">
                    <Icon name={W.icon as IconName} size={15} />
                    {back ? W.label : card.eyebrow}
                  </span>
                  <div className="dbody" aria-hidden={back || undefined}>
                    <h2 className={card.small ? "title-sm" : "title"}>{card.title}</h2>
                    {card.meta ? <p className="meta">{card.meta}</p> : null}
                    <div className="actions">
                      <button type="button" className="go" onClick={card.onAction} tabIndex={back ? -1 : undefined}>
                        {card.action}
                      </button>
                      {card.onListen ? (
                        <button
                          type="button"
                          className="listen"
                          onClick={card.onListen}
                          tabIndex={back ? -1 : undefined}
                          aria-label={t("استمع من حيث توقفت")}
                        >
                          <Icon name="play" size={18} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
            .reverse()}
        </div>
        <div className="qb-deck-dots" aria-hidden="true">
          {WORLD_ORDER.map((id) => (
            <i key={id} data-w={id} className={id === world ? "on" : undefined} />
          ))}
        </div>

        <div className="spacer" />
      </div>

      {accountOpen && typeof document !== "undefined"
        ? createPortal(
            <AccountSheet
              onClose={() => {
                setAccountOpen(false);
                accountBtn.current?.focus({ preventScroll: true });
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

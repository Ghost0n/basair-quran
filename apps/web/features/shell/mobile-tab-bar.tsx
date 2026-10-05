"use client";

import "./worlds.css";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useSearchParams } from "next/navigation";

import { Icon } from "@/components/icon";
import { usePreferences } from "@/lib/preferences-context";

import { useShellMode } from "./mode-context";
import {
  activeTabId,
  stepWorld,
  useWorldNavigation,
  useWorldSync,
  WORLD_ORDER,
  WORLDS,
  type WorldId,
  type WorldTab,
} from "./worlds";

import { t } from "@/lib/i18n";

const COACH_KEY = "qb.coinCoach";

// The coin's ring: one arc per world, centred at 0°, 120° and 240° (clockwise from the top).
const RING_R = 33;
const CIRC = 2 * Math.PI * RING_R;
const ARC = CIRC / 3 - 11;

// The fan: the three worlds along an arc, in reading order (right to left).
const FAN_POS: [string, string][] = [
  ["88px", "-58px"],
  ["0px", "-100px"],
  ["-88px", "-58px"],
];

const HOME_TAB: WorldTab = {
  id: "home",
  mode: "home",
  icon: "home",
  get label() {
    return t("الرئيسية");
  },
};

/**
 * The phone's tab bar: Home and the current world's three pages, around the
 * coin that switches worlds (shell/worlds.ts).
 *
 *  - tap the coin: the worlds fan out along an arc (the coin becomes a close);
 *  - swipe sideways on the bar: the next / previous world (right to left is
 *    forward, like reading); the ring turns like a dial and the coin flips;
 *  - each world tints the active tab and the coin, and its light rises softly
 *    from behind the bar.
 *
 * Changing world on Home turns the home deck; elsewhere it reopens the page
 * last used in that world. Hidden on desktop (the rail does the same).
 */
export function MobileTabBar() {
  const { mode } = useShellMode();
  const params = useSearchParams();
  const communityTab = params.get("tab");
  const world = useWorldSync(communityTab);
  const { openTab, changeWorld } = useWorldNavigation();
  const { preferences } = usePreferences();
  const [fan, setFan] = useState(false);
  const [turns, setTurns] = useState(0);
  const [swap, setSwap] = useState<"fwd" | "back" | null>(null);
  const [flip, setFlip] = useState(0);
  const [coach, setCoach] = useState(false);
  const previousWorld = useRef(world);
  const coinRef = useRef<HTMLButtonElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swallow = useRef(false);

  const onHome = mode === "home";
  const active = activeTabId(mode, communityTab);
  const W = WORLDS[world];

  // The tabs slide and the coin flips whenever the world changes, however it changed.
  useEffect(() => {
    const before = previousWorld.current;
    previousWorld.current = world;
    if (before === world) return;
    const forward = WORLD_ORDER.indexOf(world) > WORLD_ORDER.indexOf(before);
    setSwap(forward ? "fwd" : "back");
    setFlip((value) => value + 1);
    setFan(false);
  }, [world]);

  // A new user sees, once, where the worlds are.
  const newUser = !preferences.last_position?.page && !preferences.last_position?.ayah_id;
  useEffect(() => {
    if (!onHome || !newUser) {
      setCoach(false);
      return;
    }
    try {
      setCoach(!window.localStorage.getItem(COACH_KEY));
    } catch {
      setCoach(false);
    }
  }, [onHome, newUser]);
  function dismissCoach() {
    setCoach(false);
    try {
      window.localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* shown again next time */
    }
  }

  useEffect(() => {
    if (!fan) return;
    fanRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setFan(false);
        coinRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fan]);

  function goWorld(next: WorldId, wrap = 0) {
    setFan(false);
    if (next === world) return;
    // Keep the dial turning the short way round when it wraps (community → reading).
    const from = WORLD_ORDER.indexOf(world);
    const to = WORLD_ORDER.indexOf(next);
    if (wrap > 0 && to < from) setTurns((value) => value - 1);
    if (wrap < 0 && to > from) setTurns((value) => value + 1);
    changeWorld(next, onHome);
  }

  function onCoinKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? 1 : -1;
      goWorld(stepWorld(world, delta), delta);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    swipe.current = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 44 && Math.abs(dy) < 30) {
      swallow.current = true;
      const delta = dx < 0 ? 1 : -1;
      goWorld(stepWorld(world, delta), delta);
    }
  }

  const tab = (item: WorldTab) => {
    const current = item.id === active;
    return (
      <button
        key={item.id}
        type="button"
        className={`qb-tabbar-btn${current ? " active" : ""}`}
        aria-current={current ? "page" : undefined}
        onClick={() => {
          if (swallow.current) {
            swallow.current = false;
            return;
          }
          openTab(world, item.id);
        }}
      >
        <span className="tile">
          <Icon name={item.icon} size={20} />
        </span>
        <span className="label" data-fit-watch>
          {item.label}
        </span>
      </button>
    );
  };

  const ringTurn = -WORLD_ORDER.indexOf(world) * 120 + turns * 360;

  return (
    <nav
      className={`qb-tabbar qb-worldbar${fan ? " fan-open" : ""}`}
      data-autofit="2"
      aria-label={t("التنقل")}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipe.current = null)}
    >
      <div className="qb-worldglow" aria-hidden="true">
        {WORLD_ORDER.map((id) => (
          <span key={id} data-w={id} className={id === world ? "on" : undefined} />
        ))}
      </div>
      <div className={`qb-fanscrim${fan ? " open" : ""}`} onClick={() => setFan(false)} aria-hidden="true" />
      <div className={`qb-fan${fan ? " open" : ""}`} ref={fanRef} role="menu" aria-label={t("العوالم")} inert={!fan}>
        {WORLD_ORDER.map((id, index) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="fanopt"
            data-w={id}
            aria-current={id === world}
            style={{ "--dx": FAN_POS[index][0], "--dy": FAN_POS[index][1] } as CSSProperties}
            onClick={() => goWorld(id)}
          >
            <span className="wi">
              <Icon name={WORLDS[id].icon} size={22} />
            </span>
            <b>{WORLDS[id].label}</b>
            <small>{WORLDS[id].desc}</small>
          </button>
        ))}
      </div>
      {coach ? (
        <button type="button" className="qb-coin-coach" onClick={dismissCoach}>
          {t("اضغط الدائرة للتنقل بين القراءة والبحث والمجتمع")}
        </button>
      ) : null}

      <div className="navshadow" aria-hidden="true" />
      <div className="navbg" aria-hidden="true" />
      <div className="tabrow">
        <div key={`s-${world}`} className={`tabs${swap ? ` swap-${swap}` : ""}`}>
          {tab(HOME_TAB)}
          {tab(W.tabs[0])}
        </div>
        <div className="coinslot">
          <button
            ref={coinRef}
            type="button"
            className="coin"
            aria-haspopup="menu"
            aria-expanded={fan}
            aria-label={fan ? t("إغلاق العوالم") : t("العالم: {0}. اختر عالماً آخر", { 0: W.label })}
            onClick={() => {
              if (swallow.current) {
                swallow.current = false;
                return;
              }
              dismissCoach();
              setFan((value) => !value);
            }}
            onKeyDown={onCoinKey}
          >
            <svg className="ring" viewBox="0 0 72 72" aria-hidden="true" style={{ transform: `rotate(${ringTurn}deg)` }}>
              {WORLD_ORDER.map((id, index) => (
                <circle
                  key={id}
                  className={`arc${id === world ? " on" : ""}`}
                  data-w={id}
                  cx="36"
                  cy="36"
                  r={RING_R}
                  strokeDasharray={`${ARC.toFixed(1)} ${(CIRC - ARC).toFixed(1)}`}
                  transform={`rotate(${(index * 120 - 90 - (ARC / CIRC) * 180).toFixed(1)} 36 36)`}
                />
              ))}
            </svg>
            <span key={flip} className={`disc${flip ? " flip" : ""}`}>
              <span className="face w">
                <Icon name={W.icon} size={24} stroke={2} />
              </span>
              <span className="face x">
                <Icon name="close" size={22} stroke={2} />
              </span>
            </span>
          </button>
          <span className="coinlabel" aria-hidden="true">
            {W.label}
          </span>
        </div>
        <div key={`e-${world}`} className={`tabs${swap ? ` swap-${swap}` : ""}`}>
          {tab(W.tabs[1])}
          {tab(W.tabs[2])}
        </div>
      </div>
    </nav>
  );
}

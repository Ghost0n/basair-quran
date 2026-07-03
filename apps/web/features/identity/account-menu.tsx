"use client";

import { useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { AuthUserInfo } from "@q-basair/shared";

import { AVATAR_MOTIFS, type AvatarMotif, UserAvatar } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";

import "./account-menu.css";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const MOTIFS = Object.keys(AVATAR_MOTIFS) as AvatarMotif[];

function toMotif(value?: string | null): AvatarMotif {
  return value && (MOTIFS as string[]).includes(value) ? (value as AvatarMotif) : "ba";
}

type AccountMenuProps = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
};

/**
 * AccountMenu — the rail's identity affordance. A calligraphic medallion that
 * opens a popover (profile, theme, settings link, sync line, sign out). Only
 * rendered when auth is enabled; guests get a quiet sign-in link instead.
 */
export function AccountMenu({ theme, onToggleTheme, onOpenSettings }: AccountMenuProps) {
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number }>({ bottom: 12, left: 80 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let cancelled = false;
    api
      .getAuthSession({ suppressAuthRedirect: true })
      .then((session) => {
        if (!cancelled && session.authenticated) setUser(session.user ?? null);
      })
      .catch(() => {
        /* guest / offline */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!AUTH_ENABLED) return null;

  if (!user) {
    return (
      <a className="qb-rail-btn" href="/login" title="تسجيل الدخول" aria-label="تسجيل الدخول">
        <Icon name="user" size={19} />
        <span className="qb-rail-label">دخول</span>
      </a>
    );
  }

  const motif = toMotif(user.avatar);

  function toggleOpen() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      // Rail sits on the RTL-right; the popover opens toward the room (left of it).
      setPos({ bottom: Math.max(12, window.innerHeight - rect.bottom), left: Math.max(8, rect.left - 274) });
    }
    setOpen((value) => !value);
  }

  async function signOut() {
    try {
      await api.logout({ suppressAuthRedirect: true });
    } catch {
      /* ignore */
    }
    window.location.assign("/login");
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`qb-rail-btn qb-account-btn${open ? " active" : ""}`}
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.name || user.email}
      >
        <UserAvatar motif={motif} size={28} />
        <span className="qb-rail-label">حسابي</span>
      </button>

      {open ? (
        <>
          <div className="qb-account-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="qb-account-pop"
            role="menu"
            style={{ bottom: pos.bottom, insetInlineStart: pos.left }}
          >
            <div className="qb-account-head">
              <UserAvatar motif={motif} size={40} />
              <div className="who">
                <div className="name">{user.name || "مستخدم"}</div>
                <div className="email">{user.email}</div>
              </div>
            </div>

            <div className="qb-account-body">
              <div className="qb-account-theme">
                السِّمة
                <span
                  className="seg"
                  onClick={onToggleTheme}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onToggleTheme();
                  }}
                >
                  <span className={theme === "dark" ? "on" : ""}>داكنة</span>
                  <span className={theme === "light" ? "on" : ""}>فاتحة</span>
                </span>
              </div>

              <button
                type="button"
                className="qb-account-link"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
              >
                الإعدادات والأجهزة
                <span className="chev">›</span>
              </button>

              <div className="qb-account-sync">
                <span className="dot" aria-hidden />
                محفوظاتك تُزامَن تلقائياً
              </div>
            </div>

            <div className="qb-account-foot">
              <button type="button" className="qb-account-signout" onClick={signOut}>
                <Icon name="logout" size={15} />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

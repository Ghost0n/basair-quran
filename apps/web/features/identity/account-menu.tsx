"use client";

import { useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";

import { AVATAR_MOTIFS, type AvatarMotif, UserAvatar } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { useAuthSession } from "@/lib/auth-session-context";
import { clearGuestChoice } from "@/features/auth/identity-flow";

import "./account-menu.css";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const MOTIFS = Object.keys(AVATAR_MOTIFS) as AvatarMotif[];

function toMotif(value?: string | null): AvatarMotif {
  return value && (MOTIFS as string[]).includes(value) ? (value as AvatarMotif) : "ba";
}

type AccountMenuProps = {
  onOpenSettings: () => void;
};

/**
 * AccountMenu — the rail's identity affordance. A calligraphic medallion that
 * opens a popover (profile, settings link, sync line, sign out) flowing to the
 * right of the button. Theme now lives in its own top-bar button. Only rendered
 * when auth is enabled; guests get a quiet sign-in link instead.
 */
export function AccountMenu({ onOpenSettings }: AccountMenuProps) {
  const { user } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number }>({ bottom: 12, left: 80 });
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!AUTH_ENABLED) return null;

  if (!user) {
    return (
      <a className="qb-rail-btn" href="/login" title={t("تسجيل الدخول")} aria-label={t("تسجيل الدخول")}>
        <Icon name="user" size={19} />
        <span className="qb-rail-label" data-fit-watch>{t("دخول")}</span>
      </a>
    );
  }

  const motif = toMotif(user.avatar);

  function toggleOpen() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      // The rail sits at the RTL-right edge. The popover flows out from the button
      // into the room (to its left), hugging the rail and opening upward from the
      // bottom-of-rail medallion. `left` is applied as insetInlineStart which, in
      // this RTL app, resolves to `right` — so it's a distance from the viewport's
      // right edge: seat the popover's right edge just left of the button.
      setPos({
        bottom: Math.max(12, window.innerHeight - rect.bottom),
        left: Math.max(8, window.innerWidth - rect.left + 8),
      });
    }
    setOpen((value) => !value);
  }

  async function signOut() {
    try {
      await api.logout({ suppressAuthRedirect: true });
    } catch {
      /* ignore */
    }
    clearGuestChoice();
    window.location.assign("/");
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
        <span className="qb-rail-label" data-fit-watch>{t("حسابي")}</span>
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
                <div className="name">{user.name || t("مستخدم")}</div>
                <div className="email">{user.email}</div>
              </div>
            </div>

            <div className="qb-account-body">
              <button
                type="button"
                className="qb-account-link"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
              >
                {t("الإعدادات والأجهزة")}
                <span className="chev">›</span>
              </button>

              <div className="qb-account-sync">
                <span className="dot" aria-hidden />
                {t("محفوظاتك تُزامَن تلقائياً")}
              </div>
            </div>

            <div className="qb-account-foot">
              <button type="button" className="qb-account-signout" onClick={signOut}>
                <Icon name="logout" size={15} />
                {t("تسجيل الخروج")}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

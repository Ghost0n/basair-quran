"use client";

import { useEffect, useState } from "react";

import type { AuthUserInfo } from "@q-basair/shared";

import { AVATAR_MOTIFS, type AvatarMotif, UserAvatar } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { AUTH_ENABLED } from "@/lib/config";
import { clearGuestChoice, identityApi } from "@/features/auth/identity-flow";

import "./more-sheet.css";

const MOTIFS = Object.keys(AVATAR_MOTIFS) as AvatarMotif[];

function toMotif(value?: string | null): AvatarMotif {
  return value && (MOTIFS as string[]).includes(value) ? (value as AvatarMotif) : "ba";
}

type MoreSheetProps = {
  onClose: () => void;
  onOpenSettings: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

/**
 * MoreSheet — the mobile overflow (المزيد): account, theme, settings, sign-out.
 * The mobile counterpart of the desktop rail's account menu + settings button.
 */
export function MoreSheet({ onClose, onOpenSettings, theme, onToggleTheme }: MoreSheetProps) {
  const [user, setUser] = useState<AuthUserInfo | null>(null);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let cancelled = false;
    identityApi
      .getAuthSession({ suppressAuthRedirect: true })
      .then((session) => {
        if (!cancelled && session.authenticated) setUser(session.user ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    try {
      await identityApi.logout({ suppressAuthRedirect: true });
    } catch {
      /* ignore */
    }
    clearGuestChoice();
    window.location.assign("/");
  }

  return (
    <div className="qb-more" role="dialog" aria-modal="true" aria-label="المزيد">
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="sheet">
        <div className="grip" aria-hidden />

        {AUTH_ENABLED && user ? (
          <div className="who">
            <UserAvatar motif={toMotif(user.avatar)} size={40} />
            <div className="meta">
              <div className="name">{user.name || "مستخدم"}</div>
              <div className="email">{user.email}</div>
            </div>
          </div>
        ) : AUTH_ENABLED ? (
          <a className="row" href="/login" onClick={onClose}>
            <Icon name="user" size={18} />
            تسجيل الدخول أو إنشاء حساب
          </a>
        ) : null}

        <div className="row theme">
          السِّمة
          <span className="seg" onClick={onToggleTheme} role="button" tabIndex={0}>
            <span className={theme === "dark" ? "on" : ""}>داكنة</span>
            <span className={theme === "light" ? "on" : ""}>فاتحة</span>
          </span>
        </div>

        <button
          type="button"
          className="row"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <Icon name="settings" size={18} />
          الإعدادات
          <span className="chev">›</span>
        </button>

        {AUTH_ENABLED && user ? (
          <button type="button" className="row danger" onClick={signOut}>
            <Icon name="logout" size={18} />
            تسجيل الخروج
          </button>
        ) : null}
      </div>
    </div>
  );
}

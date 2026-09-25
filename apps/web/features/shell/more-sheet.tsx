"use client";

import { AVATAR_MOTIFS, type AvatarMotif, UserAvatar } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { AUTH_ENABLED } from "@/lib/config";
import { useAuthSession } from "@/lib/auth-session-context";
import { useDialog } from "@/lib/use-dialog";
import { clearGuestChoice, identityApi } from "@/features/auth/identity-flow";

import "./more-sheet.css";

import { t } from "@/lib/i18n";

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
  const { user } = useAuthSession();
  const sheetRef = useDialog<HTMLDivElement>(onClose);

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
    <div className="qb-more" role="dialog" aria-modal="true" aria-label={t("المزيد")}>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
        <div className="grip" aria-hidden />

        {AUTH_ENABLED && user ? (
          <div className="who">
            <UserAvatar motif={toMotif(user.avatar)} size={40} />
            <div className="meta">
              <div className="name">{user.name || t("مستخدم")}</div>
              <div className="email">{user.email}</div>
            </div>
          </div>
        ) : AUTH_ENABLED ? (
          <a className="row" href="/login" onClick={onClose}>
            <Icon name="user" size={18} />
            {t("تسجيل الدخول أو إنشاء حساب")}
          </a>
        ) : null}

        <div className="row theme">
          {t("السِّمة")}
          <span
            className="seg"
            onClick={onToggleTheme}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleTheme();
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={theme === "light"}
            aria-label={t("تبديل السِّمة")}
          >
            <span className={theme === "dark" ? "on" : ""}>{t("داكنة")}</span>
            <span className={theme === "light" ? "on" : ""}>{t("فاتحة")}</span>
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
          {t("الإعدادات")}
          <span className="chev">›</span>
        </button>

        {AUTH_ENABLED && user ? (
          <button type="button" className="row danger" onClick={signOut}>
            <Icon name="logout" size={18} />
            {t("تسجيل الخروج")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { Icon } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { Sheet, usePhoneSheets } from "@/components/sheet";
import { AUTH_ENABLED } from "@/lib/config";
import { useAuthSession } from "@/lib/auth-session-context";
import { clearGuestChoice, signOutEverywhere } from "@/features/auth/identity-flow";
import { LanguageSelect } from "@/features/settings/language-select";
import { useWorkspace } from "@/features/shell/workspace-context";
import { useI18n } from "@/lib/i18n/provider";
import { digitsSetting, formatNumber, resolveNumerals, type NumeralScript } from "@/lib/numerals";
import { usePreferences } from "@/lib/preferences-context";

import "./account-menu.css";

import { t } from "@/lib/i18n";

const SCRIPTS: NumeralScript[] = ["arabic-indic", "latin", "persian"];

type AccountMenuProps = {
  onOpenSettings: () => void;
};

/**
 * AccountMenu — the rail's identity affordance. A calligraphic medallion that
 * opens a small panel beside the rail (a bottom sheet on a phone): who is
 * signed in, quick settings (interface language, digits, theme — the same
 * controls as Settings), a link to all settings, the sync line, and sign out.
 * Only rendered when auth is enabled; guests get a quiet sign-in link instead.
 */
export function AccountMenu({ onOpenSettings }: AccountMenuProps) {
  const { user } = useAuthSession();
  const [open, setOpen] = useState(false);
  // A phone held sideways keeps the rail: the menu rises as a bottom sheet there.
  const asSheet = usePhoneSheets();
  const [pos, setPos] = useState<{ bottom: number; start: number }>({ bottom: 12, start: 80 });
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


  function toggleOpen() {
    const button = btnRef.current;
    const rect = button?.getBoundingClientRect();
    if (button && rect) {
      // The rail sits on the inline-start edge (the right in Arabic, the left
      // in English). The panel opens upward from the medallion, just past the
      // rail: its inset-inline-start is the distance from that same edge.
      const rtl = getComputedStyle(button).direction === "rtl";
      setPos({
        bottom: Math.max(12, window.innerHeight - rect.bottom),
        start: Math.max(8, (rtl ? window.innerWidth - rect.left : rect.right) + 8),
      });
    }
    setOpen((value) => !value);
  }

  const panel = (
    <AccountPanel
      user={user}
      name={user.name || t("مستخدم")}
      email={user.email}
      onOpenSettings={() => {
        setOpen(false);
        onOpenSettings();
      }}
    />
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`qb-rail-btn qb-account-btn${open ? " active" : ""}`}
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={user.name || user.email}
      >
        <UserAvatar user={user} size={28} />
        <span className="qb-rail-label" data-fit-watch>{t("حسابي")}</span>
      </button>

      {open && asSheet ? (
        <Sheet label={t("حسابي")} onClose={() => setOpen(false)} className="qb-account-sheet-pop">
          <div className="qb-account-pop is-sheet">{panel}</div>
        </Sheet>
      ) : null}
      {open && !asSheet ? (
        <>
          <div className="qb-account-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="qb-account-pop"
            role="dialog"
            aria-label={t("حسابي")}
            style={{ bottom: pos.bottom, insetInlineStart: pos.start }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                btnRef.current?.focus();
              }
            }}
          >
            {panel}
          </div>
        </>
      ) : null}
    </>
  );
}

function AccountPanel({
  user,
  name,
  email,
  onOpenSettings,
}: {
  user: Parameters<typeof UserAvatar>[0]["user"];
  name: string;
  email: string;
  onOpenSettings: () => void;
}) {
  const { preferences, updateAccount } = usePreferences();
  const { info } = useI18n();
  const { state, actions } = useWorkspace();
  const dark = state.theme !== "light";

  async function signOut() {
    clearGuestChoice();
    await signOutEverywhere("/");
  }

  return (
    <>
      <div className="qb-account-head">
        <UserAvatar user={user} size={40} />
        <div className="who">
          <div className="name">{name}</div>
          <div className="email">{email}</div>
        </div>
      </div>

      <div className="qb-account-quick">
        <div className="qb-account-row">
          <span className="lbl">{t("لغة الواجهة")}</span>
          <LanguageSelect className="qb-account-select" />
        </div>
        <div className="qb-account-row">
          <span className="lbl">{t("الأرقام")}</span>
          <SelectMenu
            className="qb-account-select is-digits"
            ariaLabel={t("الأرقام")}
            value={resolveNumerals(preferences.numerals, info.numerals)}
            options={SCRIPTS.map((script) => ({ value: script, label: formatNumber("012", script) }))}
            onChange={(script) => void updateAccount({ numerals: digitsSetting(script as NumeralScript, info.numerals) }).catch(() => {})}
          />
        </div>
        <div className="qb-account-row">
          <span className="lbl">{t("السمة")}</span>
          <div className="qb-account-theme" role="group" aria-label={t("السمة")}>
            <button type="button" aria-pressed={!dark} onClick={() => dark && actions.toggleTheme()} title={t("فاتحة")}>
              <Icon name="sun" size={15} />
              <span className="qb-sr-only">{t("فاتحة")}</span>
            </button>
            <button type="button" aria-pressed={dark} onClick={() => !dark && actions.toggleTheme()} title={t("داكنة")}>
              <Icon name="moon" size={15} />
              <span className="qb-sr-only">{t("داكنة")}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="qb-account-body">
        <button type="button" className="qb-account-link" onClick={onOpenSettings}>
          <Icon name="settings" size={15} />
          {t("الإعدادات والأجهزة")}
          <span className="chev dir-flip">›</span>
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
    </>
  );
}

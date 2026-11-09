"use client";

import "@/features/reading/reading.css";

import { Icon } from "@/components/icon";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { useAuthSession } from "@/lib/auth-session-context";
import { AUTH_ENABLED } from "@/lib/config";
import { useDialog } from "@/lib/use-dialog";
import { signOutEverywhere } from "@/features/auth/identity-flow";

import { t } from "@/lib/i18n";

/**
 * Account and settings, opened from Home's corner button (they left the tab
 * bar): settings, the theme, and — with accounts on — the account and sync,
 * or signing in. A bottom sheet on phones, a centred panel on larger screens.
 */
export function AccountSheet({ onClose }: { onClose: () => void }) {
  const { setMode } = useShellMode();
  const { state, actions } = useWorkspace();
  const { user } = useAuthSession();
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const dark = state.theme !== "light";

  function settings() {
    onClose();
    setMode("settings");
  }

  async function signOut() {
    await signOutEverywhere("/");
  }

  return (
    <div className="qb-rsheet qb-account-sheet" role="dialog" aria-modal="true" aria-labelledby="qb-account-sheet-title">
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <div>
            <h2 id="qb-account-sheet-title">{t("الحساب والإعدادات")}</h2>
            {AUTH_ENABLED && user ? <p className="sub">{t("المزامنة مفعّلة")}</p> : null}
          </div>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="body menu-list">
          <button type="button" className="menu-item" onClick={settings}>
            <span className="ico">
              <Icon name="settings" size={18} />
            </span>
            <span className="txt">
              {t("الإعدادات")}
              <small>{t("المصحف، العرض، اللغة")}</small>
            </span>
            <Icon name="chevLeft" size={16} />
          </button>
          <button type="button" className="menu-item" onClick={actions.toggleTheme} aria-pressed={!dark}>
            <span className="ico">
              <Icon name={dark ? "sun" : "moon"} size={18} />
            </span>
            <span className="txt">
              {dark ? t("التبديل إلى السِّمة الفاتحة") : t("التبديل إلى السِّمة الداكنة")}
              <small>{t("السمة")}</small>
            </span>
          </button>
          {AUTH_ENABLED ? (
            user ? (
              <>
                <button type="button" className="menu-item" onClick={settings}>
                  <span className="ico">
                    <Icon name="user" size={18} />
                  </span>
                  <span className="txt">
                    {t("الحساب والمزامنة")}
                    <small>{user.name || user.email}</small>
                  </span>
                  <Icon name="chevLeft" size={16} />
                </button>
                <button type="button" className="menu-item quiet" onClick={signOut}>
                  <span className="ico">
                    <Icon name="logout" size={18} />
                  </span>
                  <span className="txt">{t("تسجيل الخروج")}</span>
                </button>
              </>
            ) : (
              <a className="menu-item" href="/login">
                <span className="ico">
                  <Icon name="user" size={18} />
                </span>
                <span className="txt">
                  {t("تسجيل الدخول")}
                  <small>{t("لمزامنة محفوظاتك بين أجهزتك")}</small>
                </span>
                <Icon name="chevLeft" size={16} />
              </a>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

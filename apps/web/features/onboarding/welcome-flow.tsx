"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AUTH_ENABLED } from "@/lib/config";

import "@/features/auth/auth.css";
import "@/features/auth/auth.web.css";
import { identityApi, maybeMergeGuestData, sanitizeNextPath } from "@/features/auth/identity-flow";

import { t } from "@/lib/i18n";
import { useNumerals } from "@/lib/preferences-context";

/**
 * The first visit of a new account: three things to know, then the reader is
 * where they were headed. Nothing to choose — the medallion is the initial of
 * their name on a pattern given with the account (lib/avatar.ts), which they
 * can change in Settings.
 */
export function WelcomeFlow() {
  const formatNumber = useNumerals();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!AUTH_ENABLED) {
      window.location.assign("/");
      return;
    }
    let active = true;
    async function check() {
      try {
        const session = await identityApi.getAuthSession({ suppressAuthRedirect: true });
        if (!active) return;
        if (!session.enabled) {
          window.location.assign("/");
          return;
        }
        if (!session.authenticated || !session.user) {
          window.location.assign(`/login?next=${encodeURIComponent("/welcome")}`);
          return;
        }
        // Already onboarded — the welcome flow shows once per account.
        if (session.user.onboarded) {
          window.location.assign(nextPath);
          return;
        }
        setReady(true);
      } catch {
        window.location.assign(`/login?next=${encodeURIComponent("/welcome")}`);
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, [nextPath]);

  async function finish() {
    setSaving(true);
    try {
      await identityApi.updateProfile(
        { onboarded: true },
        { suppressAuthRedirect: true },
      );
      await maybeMergeGuestData();
    } catch {
      // Even if persistence fails, don't trap the user on the welcome screen.
    }
    window.location.assign(nextPath);
  }

  if (!ready) {
    return <div className="qb-welcome" />;
  }

  return (
    <div className="qb-welcome">
      <div className="qb-onboard-title">{t("ثلاثةُ أشياء فقط، ثم الغرفة لك")}</div>

      <div className="qb-onboard-grid">
        <div
          className="qb-onboard-card"
          style={{ animation: "qbRise var(--motion-dur-slow) var(--motion-ease-settle) 450ms both" }}
        >
          <div className="num">{formatNumber(1)}</div>
          <div className="card-title">{t("شريطٌ واحد لكل شيء")}</div>
          <div className="card-body">
            {formatNumber(t("جذرٌ أو كلمة، «الأنعام ١٠٤»، أو سؤال — الشريط يفهم قصدك ويعلنه بشارة."))}
          </div>
        </div>

        <div
          className="qb-onboard-card"
          style={{ animation: "qbRise var(--motion-dur-slow) var(--motion-ease-settle) 650ms both" }}
        >
          <div className="num">{formatNumber(2)}</div>
          <div className="card-title">{t("المصحف هو الغرفة")}</div>
          <div className="card-body">
            {t("اللوحات تُستدعى جانباً ولا تغطّي النصّ أبداً؛ الصفحة تستقرّ للخلف وتبقى.")}
          </div>
        </div>

        <div
          className="qb-onboard-card"
          style={{ animation: "qbRise var(--motion-dur-slow) var(--motion-ease-settle) 1150ms both" }}
        >
          <div className="num">{formatNumber(3)}</div>
          <div className="card-title">{t("ذهبٌ ونحاس")}</div>
          <div className="card-body">
            {t("الذهبي دليلٌ من القرآن وحده؛ النحاسي قراءةٌ تفسيرية تجريبية.")}
          </div>
          <div className="qb-onboard-disclaimer">{t("تنبيه — ليست حُجَّة شرعية")}</div>
        </div>
      </div>

      <button
        type="button"
        className="qb-welcome-cta qb-onboard-cta"
        onClick={finish}
        disabled={saving}
      >
        {t("ابدأ القراءة ←")}
      </button>
    </div>
  );
}

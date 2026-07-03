"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AVATAR_MOTIFS, type AvatarMotif, UserAvatar } from "@/components/brand-mark";
import { AUTH_ENABLED } from "@/lib/config";

import "@/features/auth/auth.css";
import { identityApi, maybeMergeGuestData, sanitizeNextPath } from "@/features/auth/identity-flow";

type Step = "avatar" | "onboard";

const MOTIFS = Object.keys(AVATAR_MOTIFS) as AvatarMotif[];

function isMotif(value: string | null | undefined): value is AvatarMotif {
  return !!value && (MOTIFS as string[]).includes(value);
}

export function WelcomeFlow() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);

  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>("avatar");
  const [motif, setMotif] = useState<AvatarMotif>("ba");
  const [displayName, setDisplayName] = useState("أبو محمد");
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
        if (session.user.name) setDisplayName(session.user.name);
        if (isMotif(session.user.avatar)) setMotif(session.user.avatar);
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
      const user = await identityApi.updateProfile(
        { avatar: motif, onboarded: true },
        { suppressAuthRedirect: true },
      );
      await maybeMergeGuestData(user.id);
    } catch {
      // Even if persistence fails, don't trap the user on the welcome screen.
    }
    window.location.assign(nextPath);
  }

  if (!ready) {
    return <div className="qb-welcome" />;
  }

  if (step === "avatar") {
    return (
      <div className="qb-welcome">
        <div className="qb-welcome-step">
          الخطوة <strong>٢</strong> من ٣ — اختر مداليتك
        </div>

        <div className="qb-avatar-preview">
          <UserAvatar motif={motif} size={88} />
          <div className="qb-avatar-preview-copy">
            <div className="name">{displayName}</div>
            <div className="hint">
              مداليتك في الشريط والقوائم وبطاقات الجلسات — حرفٌ من اسمك أو زخرفة.
            </div>
          </div>
        </div>

        <div className="qb-avatar-tiles">
          {MOTIFS.map((key) => {
            const spec = AVATAR_MOTIFS[key];
            const selected = key === motif;
            return (
              <button
                key={key}
                type="button"
                className={`qb-avatar-tile ${selected ? "selected" : ""}`}
                onClick={() => setMotif(key)}
                aria-pressed={selected}
                aria-label={spec.label}
                title={spec.label}
              >
                <UserAvatar motif={key} size={40} ring={false} />
              </button>
            );
          })}
        </div>

        <button type="button" className="qb-welcome-cta step-avatar" onClick={() => setStep("onboard")}>
          متابعة ←
        </button>
      </div>
    );
  }

  return (
    <div className="qb-welcome">
      <div className="qb-onboard-title">ثلاثةُ أشياء فقط، ثم الغرفة لك</div>

      <div className="qb-onboard-grid">
        <div
          className="qb-onboard-card"
          style={{ animation: "qbRise var(--motion-dur-slow) var(--motion-ease-settle) 450ms both" }}
        >
          <div className="num">١</div>
          <div className="card-title">شريطٌ واحد لكل شيء</div>
          <div className="card-body">
            جذرٌ أو كلمة، «الأنعام ١٠٤»، أو سؤال — الشريط يفهم قصدك ويعلنه بشارة.
          </div>
        </div>

        <div
          className="qb-onboard-card"
          style={{ animation: "qbRise var(--motion-dur-slow) var(--motion-ease-settle) 650ms both" }}
        >
          <div className="num">٢</div>
          <div className="card-title">المصحف هو الغرفة</div>
          <div className="card-body">
            اللوحات تُستدعى جانباً ولا تغطّي النصّ أبداً؛ الصفحة تستقرّ للخلف وتبقى.
          </div>
        </div>

        <div
          className="qb-onboard-card"
          style={{ animation: "qbRise var(--motion-dur-slow) var(--motion-ease-settle) 1150ms both" }}
        >
          <div className="num">٣</div>
          <div className="card-title">ذهبٌ ونحاس</div>
          <div className="card-body">
            الذهبي دليلٌ من القرآن وحده؛ النحاسي قراءةٌ تفسيرية تجريبية.
          </div>
          <div className="qb-onboard-disclaimer">تنبيه — ليست حُجَّة شرعية</div>
        </div>
      </div>

      <button
        type="button"
        className="qb-welcome-cta qb-onboard-cta"
        onClick={finish}
        disabled={saving}
      >
        ابدأ القراءة ←
      </button>
    </div>
  );
}

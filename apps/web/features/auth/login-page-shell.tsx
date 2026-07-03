"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { AUTH_ENABLED } from "@/lib/config";

import "./auth.css";
import { continueAsGuest, identityApi, routeAfterAuth, sanitizeNextPath } from "./identity-flow";

type AuthTab = "in" | "up";

function messageForError(error: unknown, tab: AuthTab): string {
  const text = error instanceof Error ? error.message : "";
  if (text.includes(" 409")) return "هذا البريد مُسجَّل بالفعل — جرّب تسجيل الدخول.";
  if (text.includes(" 401")) return "البريد أو كلمة المرور غير صحيحة.";
  if (text.includes(" 422")) return "تحقّق من البريد وكلمة المرور (ثمانية أحرف فأكثر).";
  return tab === "up" ? "تعذّر إنشاء الحساب." : "تعذّر تسجيل الدخول.";
}

export function LoginPageShell() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);

  const [tab, setTab] = useState<AuthTab>(searchParams.get("tab") === "signup" ? "up" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  const isSignup = tab === "up";

  useEffect(() => {
    if (!AUTH_ENABLED) {
      window.location.assign("/");
      return;
    }
    let active = true;
    async function checkSession() {
      try {
        const session = await identityApi.getAuthSession({ suppressAuthRedirect: true });
        if (!active) return;
        if (!session.enabled) {
          window.location.assign("/");
          return;
        }
        if (session.authenticated) {
          await routeAfterAuth(session, nextPath);
          return;
        }
      } catch {
        // Keep the form visible when the session probe fails.
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, [nextPath]);

  function switchTab(next: AuthTab) {
    setTab(next);
    setError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim() || (isSignup && !name.trim())) {
      setError(
        isSignup
          ? "أكمِل الحقول — البريد وكلمة المرور مطلوبان، والاسم أيضاً."
          : "أكمِل الحقول — البريد وكلمة المرور مطلوبان.",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = isSignup
        ? await identityApi.signup(
            { email, password, name, invite_code: invite || null, platform: "web" },
            { suppressAuthRedirect: true },
          )
        : await identityApi.login({ email, password, platform: "web" }, { suppressAuthRedirect: true });
      if (!session.authenticated) {
        throw new Error("تعذّر إنشاء الجلسة.");
      }
      await routeAfterAuth(session, nextPath);
    } catch (err) {
      setError(messageForError(err, tab));
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="qb-auth">
        <div className="qb-auth-guest-note" style={{ animation: "none" }}>
          جارٍ التحقّق من الجلسة…
        </div>
      </div>
    );
  }

  return (
    <div className="qb-auth">
      <div style={{ animation: "qbRise 500ms var(--motion-ease-settle) both" }}>
        <BrandMark size={66} />
      </div>
      <div className="qb-auth-head" style={{ animation: "qbRise 500ms var(--motion-ease-settle) 80ms both" }}>
        <div className="qb-auth-wordmark">بَصَائِر القُرآن</div>
        <div className="qb-auth-sub">BASAIR · THE SCHOLAR&apos;S ROOM</div>
      </div>

      <form
        className="qb-auth-card"
        onSubmit={handleSubmit}
        style={{ animation: "qbRise 500ms var(--motion-ease-settle) 160ms both" }}
      >
        <div className="qb-auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={`qb-auth-tab ${!isSignup ? "active" : ""}`}
            onClick={() => switchTab("in")}
          >
            دخول
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={`qb-auth-tab ${isSignup ? "active" : ""}`}
            onClick={() => switchTab("up")}
          >
            حساب جديد
          </button>
        </div>

        {isSignup ? (
          <label className="qb-auth-field qb-auth-signup-name">
            <span className="label">اسمك — كما تحبّ أن تُنادى</span>
            <input
              className="qb-auth-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="أبو محمد"
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className="qb-auth-field">
          <span className="label">البريد الإلكتروني</span>
          <input
            className="qb-auth-input ltr"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            autoComplete="username"
          />
        </label>

        <label className="qb-auth-field">
          <span className="label-row">
            <span className="label">كلمة المرور</span>
            {!isSignup ? (
              <button type="button" className="forgot">
                نسيتها؟
              </button>
            ) : null}
          </span>
          <input
            className="qb-auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="ثمانية أحرف فأكثر"
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
        </label>

        {error ? <div className="qb-auth-error" role="alert">{error}</div> : null}

        <button type="submit" className="qb-auth-cta" disabled={loading}>
          {loading ? <span className="qb-auth-spinner" aria-hidden /> : null}
          {loading ? "لحظة…" : isSignup ? "أنشئ حسابك" : "دخول"}
        </button>

        {isSignup ? (
          <div className="qb-auth-invite">
            <div className="qb-auth-invite-head">
              <span>رمز دعوة؟</span>
              <span className="optional">اختياري</span>
            </div>
            <input
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              placeholder="INVITE-CODE"
              aria-label="رمز دعوة اختياري"
            />
          </div>
        ) : null}
      </form>

      <button
        type="button"
        className="qb-landing-guest"
        onClick={() => {
          continueAsGuest();
          window.location.assign("/");
        }}
      >
        تصفّح كضيف ←
      </button>

      <div className="qb-auth-guest-note">
        عند إنشاء الحساب نضمّ محفوظاتك تلقائياً
      </div>
    </div>
  );
}

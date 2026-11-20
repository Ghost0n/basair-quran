"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { AUTH_ENABLED } from "@/lib/config";

import "./auth.css";
import "./auth.web.css";

import { GirihPattern } from "@/components/girih";
import { useWebDesign } from "@/lib/use-web-design";
import { continueAsGuest, identityApi, routeAfterAuth, sanitizeNextPath } from "./identity-flow";

import { t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";

type AuthTab = "in" | "up";
/** Keycloak holds the credentials (docs/keycloak.md): sign in and up on its page. */
type IdentityProvider = { loginUrl: string };

/** Why Keycloak sent the reader back (`/login?error=…`, routes/auth.py). */
function keycloakError(code: string | null): string {
  if (code === "cancelled") return t("أُلغي الدخول.");
  if (code === "email_in_use") return t("هذا البريد مرتبط بحساب آخر؛ أكِّده أولاً ثم أعد المحاولة.");
  if (code === "inactive") return t("هذا الحساب موقوف.");
  if (code) return t("تعذّر تسجيل الدخول. حاول مرة أخرى.");
  return "";
}

/** A Keycloak URL that comes back to this page (which then finishes: onboarding, guest data, `next`). */
function providerUrl(base: string, nextPath: string, locale: string): string {
  const separator = base.includes("?") ? "&" : "?";
  const params = new URLSearchParams({ return_to: `/login?from=idp&next=${encodeURIComponent(nextPath)}`, locale });
  return `${base}${separator}${params.toString()}`;
}

function messageForError(error: unknown, tab: AuthTab): string {
  const text = error instanceof Error ? error.message : "";
  if (text.includes(" 409")) return t("هذا البريد مُسجَّل بالفعل — جرّب تسجيل الدخول.");
  if (text.includes(" 401")) return t("البريد أو كلمة المرور غير صحيحة.");
  if (text.includes(" 422")) return t("تحقّق من البريد وكلمة المرور (ثمانية أحرف فأكثر).");
  return tab === "up" ? t("تعذّر إنشاء الحساب.") : t("تعذّر تسجيل الدخول.");
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
  // Password-reset sub-flow. The emailed link (/login?reset=<token>) opens the
  // reset step with the code pre-filled; the code can also be pasted by hand.
  const linkToken = searchParams.get("reset") ?? "";
  const [view, setView] = useState<"auth" | "forgot" | "reset">(linkToken ? "reset" : "auth");
  const [resetToken, setResetToken] = useState(linkToken);
  const [notice, setNotice] = useState("");
  const [identityProvider, setIdentityProvider] = useState<IdentityProvider | null>(null);
  const { locale } = useI18n();

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
        if (session.provider === "keycloak" && session.login_url && session.signup_url) {
          // One account page on Keycloak (its «دخول | حساب جديد» tabs and the providers): go
          // straight there, unless it just sent the reader back (an error to read, or a
          // finished sign-in that did not take — never bounce between the two).
          if (!searchParams.get("error") && searchParams.get("from") !== "idp") {
            const target = searchParams.get("tab") === "signup" ? session.signup_url : session.login_url;
            window.location.replace(providerUrl(target, nextPath, locale));
            return;
          }
          setIdentityProvider({ loginUrl: session.login_url });
        }
      } catch {
        // Keep the form visible when the session probe fails.
      }
      if (active) setCheckingSession(false);
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, [nextPath, searchParams, locale]);

  function switchTab(next: AuthTab) {
    setTab(next);
    setError("");
  }

  async function requestReset() {
    if (!email.trim()) {
      setError(t("أدخل بريدك الإلكتروني أولاً."));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await identityApi.forgotPassword(email, { suppressAuthRedirect: true });
    } catch {
      // Deliberately ignore — never reveal whether the email exists.
    }
    setLoading(false);
    setNotice(t("إن كان البريد مُسجَّلاً، فقد أرسلنا إليه رابطاً ورمزاً لإعادة التعيين (صالحَين لساعة). افتح الرابط أو أدخِل الرمز هنا."));
    setView("reset");
  }

  async function submitReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetToken.trim() || !password.trim()) {
      setError(t("أدخل الرمز وكلمة المرور الجديدة (ثمانية أحرف فأكثر)."));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await identityApi.resetPassword(resetToken.trim(), password, { suppressAuthRedirect: true });
      setNotice(t("تم تغيير كلمة المرور. سجّل الدخول بها الآن."));
      setView("auth");
      setPassword("");
      setResetToken("");
    } catch (err) {
      const text = err instanceof Error ? err.message : "";
      setError(text.includes(" 422") ? t("كلمة المرور قصيرة (ثمانية أحرف فأكثر).") : t("الرمز غير صالح أو منتهٍ."));
    }
    setLoading(false);
  }

  function backToAuth() {
    setView("auth");
    setError("");
    setNotice("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim() || (isSignup && !name.trim())) {
      setError(
        isSignup
          ? t("أكمِل الحقول — البريد وكلمة المرور مطلوبان، والاسم أيضاً.")
          : t("أكمِل الحقول — البريد وكلمة المرور مطلوبان."),
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
        throw new Error(t("تعذّر إنشاء الجلسة."));
      }
      await routeAfterAuth(session, nextPath);
    } catch (err) {
      setError(messageForError(err, tab));
      setLoading(false);
    }
  }

  const web = useWebDesign();

  if (checkingSession) {
    return (
      <div className="qb-auth">
        <div className="qb-auth-guest-note" style={{ animation: "none" }}>
          {t("جارٍ التحقّق من الجلسة…")}
        </div>
      </div>
    );
  }

  return (
    <div className="qb-auth">
      {/* Web design: the landing's rosette, drawn once behind the form. */}
      {web ? <GirihPattern className="qb-auth-girih" drawn /> : null}
      <div style={{ animation: "qbRise 500ms var(--motion-ease-settle) both" }}>
        <BrandMark size={66} />
      </div>
      <div className="qb-auth-head" style={{ animation: "qbRise 500ms var(--motion-ease-settle) 80ms both" }}>
        <div className="qb-auth-wordmark">{t("بَصَائِر القُرآن")}</div>      </div>

      {notice ? <div className="qb-auth-notice" role="status">{notice}</div> : null}

      {identityProvider ? (
        <div className="qb-auth-card qb-auth-provider" style={{ animation: "qbRise 500ms var(--motion-ease-settle) 160ms both" }}>
          <div className="qb-auth-reset-title">{t("حسابك في بصائر القرآن")}</div>
          <p className="qb-auth-provider-note">
            {t("الدخول بالبريد أو بحساب Apple أو Google أو Meta، على صفحة دخول بصائر الآمنة.")}
          </p>
          {keycloakError(searchParams.get("error")) ? (
            <div className="qb-auth-error" role="alert">
              {keycloakError(searchParams.get("error"))}
            </div>
          ) : null}
          {/* Keycloak's account page holds both tabs: one way back to it. */}
          <a className="qb-auth-cta" href={providerUrl(identityProvider.loginUrl, nextPath, locale)}>
            {t("دخول")}
          </a>
        </div>
      ) : view === "forgot" ? (
        <div className="qb-auth-card" style={{ animation: "qbRise 500ms var(--motion-ease-settle) 160ms both" }}>
          <div className="qb-auth-reset-title">{t("إعادة تعيين كلمة المرور")}</div>
          <label className="qb-auth-field">
            <span className="label">{t("البريد الإلكتروني")}</span>
            <input
              className="qb-auth-input ltr"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="username"
            />
          </label>
          {error ? <div className="qb-auth-error" role="alert">{error}</div> : null}
          <button type="button" className="qb-auth-cta" onClick={requestReset} disabled={loading}>
            {loading ? t("لحظة…") : t("أرسِل رمز إعادة التعيين")}
          </button>
          <button type="button" className="forgot" onClick={backToAuth}>
            {t("← العودة لتسجيل الدخول")}
          </button>
        </div>
      ) : view === "reset" ? (
        <form
          className="qb-auth-card"
          onSubmit={submitReset}
          style={{ animation: "qbRise 500ms var(--motion-ease-settle) 160ms both" }}
        >
          <div className="qb-auth-reset-title">{t("أدخِل الرمز وكلمة المرور الجديدة")}</div>
          <label className="qb-auth-field">
            <span className="label">{t("رمز إعادة التعيين")}</span>
            <input
              className="qb-auth-input ltr"
              value={resetToken}
              onChange={(event) => setResetToken(event.target.value)}
              placeholder="RESET-TOKEN"
              autoComplete="one-time-code"
            />
          </label>
          <label className="qb-auth-field">
            <span className="label">{t("كلمة المرور الجديدة")}</span>
            <input
              className="qb-auth-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("ثمانية أحرف فأكثر")}
              autoComplete="new-password"
            />
          </label>
          {error ? <div className="qb-auth-error" role="alert">{error}</div> : null}
          <button type="submit" className="qb-auth-cta" disabled={loading}>
            {loading ? t("لحظة…") : t("غيّر كلمة المرور")}
          </button>
          <button type="button" className="forgot" onClick={backToAuth}>
            {t("← العودة لتسجيل الدخول")}
          </button>
        </form>
      ) : (
      <form
        className="qb-auth-card"
        onSubmit={handleSubmit}
        style={{ animation: "qbRise 500ms var(--motion-ease-settle) 160ms both" }}
      >
        <div className="qb-auth-tabs qb-fit-choice" data-autofit="2" suppressHydrationWarning role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={`qb-auth-tab ${!isSignup ? "active" : ""}`}
            onClick={() => switchTab("in")}
          >
            {t("دخول")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={`qb-auth-tab ${isSignup ? "active" : ""}`}
            onClick={() => switchTab("up")}
          >
            {t("حساب جديد")}
          </button>
        </div>

        {isSignup ? (
          <label className="qb-auth-field qb-auth-signup-name">
            <span className="label">{t("اسمك — كما تحبّ أن تُنادى")}</span>
            <input
              className="qb-auth-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("أبو محمد")}
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className="qb-auth-field">
          <span className="label">{t("البريد الإلكتروني")}</span>
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
            <span className="label">{t("كلمة المرور")}</span>
            {!isSignup ? (
              <button
                type="button"
                className="forgot"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setView("forgot");
                }}
              >
                {t("نسيتها؟")}
              </button>
            ) : null}
          </span>
          <input
            className="qb-auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("ثمانية أحرف فأكثر")}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
        </label>

        {error ? <div className="qb-auth-error" role="alert">{error}</div> : null}

        <button type="submit" className="qb-auth-cta" disabled={loading}>
          {loading ? <span className="qb-auth-spinner" aria-hidden /> : null}
          {loading ? t("لحظة…") : isSignup ? t("أنشئ حسابك") : t("دخول")}
        </button>

        {isSignup ? (
          <div className="qb-auth-invite">
            <div className="qb-auth-invite-head">
              <span>{t("رمز دعوة؟")}</span>
              <span className="optional">{t("اختياري")}</span>
            </div>
            <input
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              placeholder="INVITE-CODE"
              aria-label={t("رمز دعوة اختياري")}
            />
          </div>
        ) : null}
      </form>
      )}

      <button
        type="button"
        className="qb-landing-guest"
        onClick={() => {
          continueAsGuest();
          window.location.assign("/");
        }}
      >
        {t("تصفّح كضيف ←")}
      </button>

      <div className="qb-auth-guest-note">
        {t("عند إنشاء الحساب نضمّ محفوظاتك تلقائياً")}
      </div>
    </div>
  );
}

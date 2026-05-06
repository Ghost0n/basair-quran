"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";

import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

function sanitizeNextPath(rawValue: string | null): string {
  if (!rawValue || !rawValue.startsWith("/")) {
    return "/";
  }
  if (rawValue.startsWith("//")) {
    return "/";
  }
  return rawValue;
}

export function LoginPageShell() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!AUTH_ENABLED) {
      window.location.assign("/");
      return;
    }

    let active = true;

    async function checkSession() {
      try {
        const session = await api.getAuthSession({ suppressAuthRedirect: true });
        if (!active) {
          return;
        }
        if (!session.enabled) {
          window.location.assign("/");
          return;
        }
        if (session.authenticated) {
          window.location.assign(nextPath);
          return;
        }
      } catch {
        // Keep the login form visible when the session check fails.
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [nextPath]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    try {
      const response = await api.login({ email, password }, { suppressAuthRedirect: true });
      if (!response.authenticated) {
        throw new Error("تعذّر إنشاء الجلسة.");
      }
      window.location.assign(nextPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذّر تسجيل الدخول.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page-shell">
      <div className="login-card">
        <div className="login-copy">
          <span className="login-eyebrow">دخول خاص</span>
          <h1>تسجيل الدخول إلى بصائر القرآن</h1>
          <p>هذا النشر محميّ بحسابات تُدار من الخادم مباشرة. استخدم البريد وكلمة المرور الممنوحين لك.</p>
        </div>

        {checkingSession ? (
          <div className="login-state">جارٍ التحقق من الجلسة...</div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span>البريد الإلكتروني</span>
              <input
                type="email"
                dir="ltr"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@example.com"
                required
              />
            </label>

            <label className="login-field">
              <span>كلمة المرور</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </label>

            {errorMessage ? <div className="login-error">{errorMessage}</div> : null}

            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? "جارٍ الدخول..." : "دخول"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

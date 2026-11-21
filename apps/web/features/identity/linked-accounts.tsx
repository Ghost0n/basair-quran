"use client";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { LinkedAccountsResponse, LinkedProvider } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Keycloak's password policy (scripts/keycloak_realm.py): at least 10 characters, not the email.
const MIN_PASSWORD = 10;

// What the link round trip appends to the settings address (src/app/routes/auth.py).
const RESULT_PARAMS = ["linked", "link_error"];

type Notice = { tone: "ok" | "error"; text: string };

function providerName(providers: LinkedProvider[], alias: string): string {
  return providers.find((provider) => provider.alias === alias)?.name || alias;
}

/** The notice for `?linked=` / `?link_error=` after Keycloak sends the reader back. */
function noticeFromAddress(providers: LinkedProvider[]): Notice | null {
  const params = new URLSearchParams(window.location.search);
  const linked = params.get("linked");
  if (linked) return { tone: "ok", text: t("رُبط {0} بحسابك.", { 0: providerName(providers, linked) }) };
  switch (params.get("link_error")) {
    case null:
      return null;
    case "cancelled":
      return { tone: "error", text: t("أُلغي الربط.") };
    case "other_account":
      return { tone: "error", text: t("دخلتَ بحساب آخر أثناء الربط، فلم يُربط شيء.") };
    case "in_use":
      return { tone: "error", text: t("هذا الحساب مرتبط بحساب آخر في بصائر القرآن.") };
    default:
      return { tone: "error", text: t("تعذّر الربط. حاول مرة أخرى.") };
  }
}

/** This page's address without the link round trip's result. */
function currentAddress(): string {
  const url = new URL(window.location.href);
  for (const name of RESULT_PARAMS) url.searchParams.delete(name);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * «الحسابات المرتبطة» — Keycloak mode only (the API answers 404 otherwise, and the
 * card stays hidden). Each of the realm's providers (Apple, Google, Meta) shows
 * whether it is linked: «اربط» goes through Keycloak (it confirms, sends the reader
 * to the provider and back here); «افصل» unlinks at once — unless the account has
 * no password, in which case it first asks one, so the account can still sign in.
 */
export function LinkedAccounts({ email }: { email: string }) {
  const { locale } = useI18n();
  const [data, setData] = useState<LinkedAccountsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getLinkedAccounts({ suppressAuthRedirect: true })
      .then((answer) => {
        if (cancelled) return;
        setData(answer);
        setNotice(noticeFromAddress(answer.providers));
        // Once read, the result leaves the address (a reload doesn't repeat it).
        if (RESULT_PARAMS.some((name) => new URLSearchParams(window.location.search).has(name))) {
          window.history.replaceState(window.history.state, "", currentAddress());
        }
      })
      .catch((error: unknown) => {
        // 404: local accounts (no providers) — no card. Anything else: say so.
        if (!cancelled && !(error instanceof Error && error.message.includes(" 404"))) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data && !failed) return null;
  if (data && data.providers.length === 0) return null;

  function closeAsk() {
    setAsking(null);
    setPassword("");
    setConfirm("");
    setFieldError(null);
  }

  async function unlink(provider: LinkedProvider, newPassword?: string) {
    setNotice(null);
    setFieldError(null);
    setUnlinking(provider.alias);
    try {
      const answer = await api.unlinkProvider(
        provider.alias,
        newPassword ? { password: newPassword } : {},
        { suppressAuthRedirect: true },
      );
      setData(answer);
      closeAsk();
      setNotice({ tone: "ok", text: t("فُصل {0} عن حسابك.", { 0: provider.name }) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes('"password_required"')) {
        setData((current) => (current ? { ...current, has_password: false } : current));
        setAsking(provider.alias);
      } else if (message.includes('"password_rejected"')) {
        setFieldError(t("لم تُقبل كلمة المرور هذه: عشرة أحرف على الأقل، وليست بريدك."));
      } else {
        setNotice({ tone: "error", text: t("تعذّر الفصل. حاول مرة أخرى.") });
      }
    } finally {
      setUnlinking(null);
    }
  }

  function submitPassword(provider: LinkedProvider) {
    if (password.length < MIN_PASSWORD) {
      setFieldError(t("عشرة أحرف على الأقل، وليست بريدك."));
      return;
    }
    if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
      setFieldError(t("لم تُقبل كلمة المرور هذه: عشرة أحرف على الأقل، وليست بريدك."));
      return;
    }
    if (password !== confirm) {
      setFieldError(t("كلمتا المرور مختلفتان."));
      return;
    }
    void unlink(provider, password);
  }

  return (
    <section className="qb-setting-card" aria-labelledby="qb-linked-title">
      <h3 id="qb-linked-title">{t("الحسابات المرتبطة")}</h3>
      <p className="card-sub">{t("حسابات تدخل بها إلى بصائر القرآن دون كلمة مرور.")}</p>
      {notice ? (
        <div className={notice.tone === "ok" ? "qb-linked-notice" : "qb-devices-error"} role={notice.tone === "ok" ? "status" : "alert"}>
          {notice.text}
        </div>
      ) : null}
      {failed ? (
        <div className="qb-devices-error" role="alert">
          {t("تعذّر تحميل الحسابات المرتبطة.")}
        </div>
      ) : null}
      <div className="qb-devices">
        {(data?.providers ?? []).map((provider) => (
          <div key={provider.alias} className="qb-linked-item">
            <div className="qb-device-row">
              <span className={`qb-linked-mark${provider.linked ? " on" : ""}`} aria-hidden="true" />
              <div className="info">
                <div className="label">
                  {provider.name}
                  {provider.linked ? <span className="this">{t("مرتبط")}</span> : null}
                </div>
                {provider.linked && provider.username ? (
                  <div className="meta" dir="auto">
                    {provider.username}
                  </div>
                ) : null}
              </div>
              {provider.linked ? (
                <button
                  type="button"
                  className="qb-device-eject"
                  onClick={() => (data?.has_password ? void unlink(provider) : setAsking(provider.alias))}
                  disabled={unlinking !== null || asking === provider.alias}
                  aria-expanded={asking === provider.alias}
                >
                  {unlinking === provider.alias && asking !== provider.alias ? t("جارٍ الفصل…") : t("افصل")}
                </button>
              ) : (
                <a className="qb-linked-link" href={api.linkProviderUrl(provider.alias, currentAddress(), locale)}>
                  {t("اربط")}
                </a>
              )}
            </div>
            {asking === provider.alias ? (
              <form
                className="qb-linked-password"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitPassword(provider);
                }}
              >
                <p>{t("ليس لحسابك كلمة مرور. اختر واحدة لتدخل بها بعد فصل {0}.", { 0: provider.name })}</p>
                {/* The account's email, for password managers saving the new password. */}
                <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
                <label>
                  <span>{t("كلمة المرور الجديدة")}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={MIN_PASSWORD}
                    maxLength={128}
                    required
                    autoFocus
                    dir="ltr"
                    aria-describedby={`qb-linked-hint-${provider.alias}`}
                  />
                </label>
                <label>
                  <span>{t("أعد كتابتها")}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    maxLength={128}
                    required
                    dir="ltr"
                  />
                </label>
                <div id={`qb-linked-hint-${provider.alias}`} className={fieldError ? "hint error" : "hint"} role={fieldError ? "alert" : undefined}>
                  {fieldError || t("عشرة أحرف على الأقل، وليست بريدك.")}
                </div>
                <div className="qb-account-delete-actions">
                  <button type="submit" className="primary" disabled={unlinking !== null}>
                    {unlinking === provider.alias ? t("جارٍ الفصل…") : t("عيّن كلمة المرور وافصل")}
                  </button>
                  <button type="button" onClick={closeAsk} disabled={unlinking !== null}>
                    {t("إلغاء")}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

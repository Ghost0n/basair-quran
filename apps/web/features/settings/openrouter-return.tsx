"use client";

import "./settings.css";

import { useEffect, useState } from "react";

import { finishOpenRouterSignIn, handCodeToOpener, inOpenRouterWindow } from "@/lib/openrouter-signin";
import { t } from "@/lib/i18n";

/**
 * The page OpenRouter's sign-in comes back to. In the sign-in window: the code
 * goes to Settings, which opened it, and the window closes — or, when the
 * browser cut that link, the window exchanges it itself (Settings sees the key
 * through the shared storage) and closes. On a page of its own: the code is
 * exchanged, then Settings opens on «الذكاء الاصطناعي». Either says why not.
 */
export function OpenRouterReturn() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setFailed(true);
      return;
    }
    if (handCodeToOpener(code)) {
      window.close();
      return;
    }
    const popup = inOpenRouterWindow();
    finishOpenRouterSignIn(code).then(
      (done) => {
        if (!done) setFailed(true);
        else if (popup) window.close();
        else window.location.replace("/?mode=settings&section=ai");
      },
      () => setFailed(true),
    );
  }, []);
  return (
    <main className="qb-connect-return" dir="rtl">
      <p>{failed ? t("تعذّر الاتصال بـ OpenRouter. عُد إلى الإعدادات وحاول مرة أخرى.") : t("جارٍ ربط حسابك في OpenRouter…")}</p>
      {failed ? <a href="/?mode=settings&section=ai">{t("الإعدادات")}</a> : null}
    </main>
  );
}

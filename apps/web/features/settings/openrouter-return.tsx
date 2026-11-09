"use client";

import "./settings.css";

import { useEffect, useState } from "react";

import { finishOpenRouterSignIn } from "@/lib/openrouter-signin";
import { t } from "@/lib/i18n";

/**
 * The page OpenRouter's sign-in comes back to: the code is exchanged for the
 * reader's key, then Settings opens on «الذكاء الاصطناعي» (or says why not).
 */
export function OpenRouterReturn() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setFailed(true);
      return;
    }
    finishOpenRouterSignIn(code).then(
      (done) => {
        if (done) window.location.replace("/?mode=settings&section=ai");
        else setFailed(true);
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

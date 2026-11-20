"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";
import { useAuthSession } from "@/lib/auth-session-context";
import { AUTH_ENABLED } from "@/lib/config";
import { t } from "@/lib/i18n";

import { useAiProvider } from "./ai-picker";

// Set aside for this tab (sign-in) or this device (Basair's model); the
// missing-key notice can't be set aside: the study fails without the key.
const SIGN_IN_DISMISSED = "qb.studio.signInNotice";
const AI_DISMISSED = "qb.studio.aiNotice";

function readFlag(storage: "local" | "session", key: string): boolean {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(storage: "local" | "session", key: string): void {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, "1");
  } catch {
    /* storage unavailable: set aside until the next load */
  }
}

/**
 * One notice at most above the study's thread:
 * - a guest (accounts on): sign in or create an account, so the sessions are
 *   kept on the account and follow the reader;
 * - a provider chosen without its key: add it (the study fails without);
 * - Basair's own model: connect an account with a provider to pick the model.
 */
export function StudioNotices({ onOpenAiSettings }: { onOpenAiSettings: () => void }) {
  const { user, ready } = useAuthSession();
  const { connection, spec } = useAiProvider();
  const [mounted, setMounted] = useState(false);
  const [signInSetAside, setSignInSetAside] = useState(false);
  const [aiSetAside, setAiSetAside] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSignInSetAside(readFlag("session", SIGN_IN_DISMISSED));
    setAiSetAside(readFlag("local", AI_DISMISSED));
  }, []);

  if (!mounted) return null;

  if (AUTH_ENABLED && ready && !user && !signInSetAside) {
    return (
      <Notice
        icon="user"
        text={t("سجّل الدخول لتُحفظ جلساتك على حسابك وتجدها على كل أجهزتك.")}
        onDismiss={() => {
          writeFlag("session", SIGN_IN_DISMISSED);
          setSignInSetAside(true);
        }}
      >
        <a className="ok" href="/login">
          {t("تسجيل الدخول")}
        </a>
        <a className="cancel" href="/login?tab=signup">
          {t("أنشئ حساباً")}
        </a>
      </Notice>
    );
  }

  const provider = connection.provider;
  if (provider && spec && !connection.keys[provider]) {
    return (
      <Notice icon="alert" tone="warn" text={t("ينقص مفتاح {0}: أضفه في الإعدادات لتعمل الدراسة به.", { 0: spec.name })}>
        <button type="button" className="ok" onClick={onOpenAiSettings}>
          {t("أضف المفتاح")}
        </button>
      </Notice>
    );
  }

  if (!provider && !aiSetAside) {
    return (
      <Notice
        icon="sparkles"
        text={t("تعمل الدراسة بنموذج بصائر. اربط حسابك لدى أحد المزوّدين لتختار النموذج.")}
        onDismiss={() => {
          writeFlag("local", AI_DISMISSED);
          setAiSetAside(true);
        }}
      >
        <button type="button" className="ok" onClick={onOpenAiSettings}>
          {t("اربط مزوّداً")}
        </button>
      </Notice>
    );
  }

  return null;
}

function Notice({
  icon,
  text,
  tone,
  onDismiss,
  children,
}: {
  icon: "user" | "alert" | "sparkles";
  text: string;
  tone?: "warn";
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`qb-studio-notice${tone ? ` is-${tone}` : ""}`} role={tone ? "alert" : "status"}>
      <Icon name={icon} size={16} />
      <p>{text}</p>
      <div className="actions">{children}</div>
      {onDismiss ? (
        <button type="button" className="x" onClick={onDismiss} aria-label={t("إغلاق")} title={t("إغلاق")}>
          <Icon name="close" size={13} />
        </button>
      ) : null}
    </div>
  );
}

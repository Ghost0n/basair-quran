"use client";

import { useState } from "react";

import { AUTH_ENABLED } from "@/lib/config";

import { t } from "@/lib/i18n";
import { signOutEverywhere } from "@/features/auth/identity-flow";

export function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);

  if (!AUTH_ENABLED) {
    return null;
  }

  async function handleLogout() {
    setSubmitting(true);
    await signOutEverywhere("/login");
  }

  return (
    <button type="button" className="auth-logout-button" onClick={handleLogout} disabled={submitting}>
      {submitting ? t("جارٍ الخروج...") : t("تسجيل الخروج")}
    </button>
  );
}

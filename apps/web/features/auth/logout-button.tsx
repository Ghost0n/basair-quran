"use client";

import { useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";

import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

export function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);

  if (!AUTH_ENABLED) {
    return null;
  }

  async function handleLogout() {
    setSubmitting(true);
    try {
      await api.logout({ suppressAuthRedirect: true });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button type="button" className="auth-logout-button" onClick={handleLogout} disabled={submitting}>
      {submitting ? t("جارٍ الخروج...") : t("تسجيل الخروج")}
    </button>
  );
}

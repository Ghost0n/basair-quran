"use client";

import "./site.css";

import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { continueAsGuest } from "@/features/auth/identity-flow";

import { t } from "@/lib/i18n";

/** Open the app from a public page: the visitor becomes a guest on the way in (otherwise "/" shows the landing again). */
export function openApp(href = "/") {
  continueAsGuest();
  window.location.assign(href);
}

/** The public pages' links (the landing has its own section anchors too). */
export function siteLinks(): { href: string; label: string }[] {
  return [
    { href: "/guide", label: t("الدليل") },
    { href: "/guidelines", label: t("إرشادات المجتمع") },
  ];
}

/** The top bar of a public page (/guide, /guidelines): the mark, the site's pages, «افتح التطبيق». */
export function SiteBar({ current }: { current?: string }) {
  return (
    <header className="qb-site-bar">
      <a className="brand" href="/about" aria-label={t("بصائر القرآن")}>
        <BrandMark size={34} />
        <span>{t("بصائر")}</span>
      </a>
      <nav aria-label={t("صفحات الموقع")}>
        {siteLinks().map((link) => (
          <a key={link.href} href={link.href} aria-current={link.href === current ? "page" : undefined}>
            {link.label}
          </a>
        ))}
      </nav>
      <button type="button" className="qb-site-cta sm" onClick={() => openApp()}>
        {t("افتح التطبيق")}
      </button>
    </header>
  );
}

/** The footer every public page shares. */
export function SiteFoot({ children }: { children?: ReactNode }) {
  return (
    <footer className="qb-site-foot">
      <span>{t("بصائر القرآن")}</span>
      <nav aria-label={t("روابط")}>
        {children}
        {siteLinks().map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
        <a href="/about#privacy">{t("الخصوصية")}</a>
      </nav>
    </footer>
  );
}

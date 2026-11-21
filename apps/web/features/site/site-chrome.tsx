"use client";

import "./site.css";

import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { continueAsGuest } from "@/features/auth/identity-flow";
import { useNumerals } from "@/lib/preferences-context";
import { SOURCE_URL } from "@/lib/site";

import { t } from "@/lib/i18n";

import { ContactForm } from "./contact-form";
import { useBarScroll } from "./landing/use-bar-scroll";

/** Open the app from a public page: the visitor becomes a guest on the way in (otherwise "/" shows the landing again). */
export function openApp(href = "/") {
  continueAsGuest();
  window.location.assign(href);
}

/**
 * The public pages' links (the landing has its own section anchors too). The
 * guide always opens in a new tab (`away`), never in place of the page.
 */
export function siteLinks(): { href: string; label: string; away?: boolean }[] {
  return [
    { href: "/guide", label: t("الدليل"), away: true },
    { href: "/faq", label: t("الأسئلة الشائعة") },
    { href: "/guidelines", label: t("إرشادات المجتمع") },
  ];
}

/** The top bar of a public page (/guide, /guidelines): the mark, the site's pages, «افتح التطبيق». */
export function SiteBar({ current }: { current?: string }) {
  const [barRef] = useBarScroll<HTMLElement>();
  return (
    <header ref={barRef} className="qb-site-bar">
      <a className="brand" href="/about" aria-label={t("بصائر القرآن")}>
        <BrandMark size={34} />
        <span>{t("بصائر")}</span>
      </a>
      <nav aria-label={t("صفحات الموقع")}>
        {siteLinks().map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={link.href === current ? "page" : undefined}
            {...(link.away ? { target: "_blank", rel: "noopener" } : {})}
          >
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

/** The year the site started, and the current one once later. */
const SINCE = 2026;

/** The footer every public page shares: «راسلنا», the site's pages, the year. */
export function SiteFoot({ children }: { children?: ReactNode }) {
  const formatNumber = useNumerals();
  const year = new Date().getFullYear();
  const years = year > SINCE ? `${formatNumber(SINCE)}–${formatNumber(year)}` : formatNumber(SINCE);
  return (
    <footer className="qb-site-foot">
      <div className="foot-main">
        <ContactForm />
        <nav aria-label={t("روابط")}>
          {children}
          {siteLinks().map((link) => (
            <a key={link.href} href={link.href} {...(link.away ? { target: "_blank", rel: "noopener" } : {})}>
              {link.label}
            </a>
          ))}
          <a href="/about#sources">{t("المصادر")}</a>
          <a href="/about#privacy">{t("الخصوصية")}</a>
          <a href={SOURCE_URL} rel="noopener">
            {t("الشيفرة المصدرية")}
          </a>
        </nav>
      </div>
      <p className="foot-base">{t("© {0} بصائر القرآن", { 0: years })}</p>
    </footer>
  );
}

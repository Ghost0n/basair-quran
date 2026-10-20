"use client";

import "./site.css";

import { Fragment, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { useI18n } from "@/lib/i18n/provider";

import { t } from "@/lib/i18n";

import { GUIDELINES } from "./guidelines-content";

/** «**bold**» spans inside a guideline. */
function rich(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>));
}

/** /guidelines — the community guidelines in full: Arabic (the reference) or English for every other language. */
export function GuidelinesPage() {
  const { locale } = useI18n();
  const text = locale === "ar" ? GUIDELINES.ar : GUIDELINES.en;
  const dir = locale === "ar" ? "rtl" : "ltr";
  return (
    <div className="qb-site">
      <header className="qb-site-bar">
        <a className="brand" href="/about" aria-label={t("بصائر القرآن")}>
          <BrandMark size={34} />
          <span>{t("بصائر")}</span>
        </a>
        <a className="qb-site-cta sm" href="/">
          {t("افتح التطبيق")}
        </a>
      </header>
      <main className="qb-site-doc" dir={dir} lang={locale === "ar" ? "ar" : "en"}>
        <h1>{text.title}</h1>
        <p className="intro">{text.intro}</p>
        {text.note ? <p className="note">{text.note}</p> : null}
        {text.sections.map((section) => {
          const List = section.ordered ? "ol" : "ul";
          return (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <List>
                {section.items.map((item) => (
                  <li key={item}>{rich(item)}</li>
                ))}
              </List>
            </section>
          );
        })}
      </main>
    </div>
  );
}

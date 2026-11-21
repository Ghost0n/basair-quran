"use client";

import { Icon } from "@/components/icon";
import { SOURCE_URL } from "@/lib/site";

import { t } from "@/lib/i18n";

import { useInView } from "./use-reveal";

type Link = { label: string; href: string };
type Source = { what: string; links: Link[] };

/**
 * «المصادر»: where the Quran text and its data come from, each with a link to
 * its publisher (the same list as NOTICE.md, which carries each one's terms).
 * Publishers' own names stay as they write them.
 */
export function Sources() {
  const [ref, inView] = useInView<HTMLElement>();
  const sources: Source[] = [
    {
      what: t("نصّ المصحف ورواياته وخطوط صفحاته"),
      links: [{ label: t("مجمع الملك فهد لطباعة المصحف الشريف"), href: "https://qurancomplex.gov.sa" }],
    },
    {
      what: t("صرف الكلمات وجذورها"),
      links: [
        // i18n-ignore — publishers' names.
        { label: "Quranic Arabic Corpus", href: "https://corpus.quran.com" },
        // i18n-ignore
        { label: "quran-morphology", href: "https://github.com/mustafa0x/quran-morphology" },
      ],
    },
    {
      what: t("تخطيط صفحات المصحف"),
      // i18n-ignore
      links: [{ label: "mushaf-layout", href: "https://github.com/zonetecde/mushaf-layout" }],
    },
    {
      what: t("ترجمات المعاني"),
      links: [
        // i18n-ignore
        { label: "QuranEnc", href: "https://quranenc.com" },
        // i18n-ignore
        { label: "Tanzil", href: "https://tanzil.net" },
      ],
    },
    {
      what: t("التلاوات"),
      links: [
        // i18n-ignore
        { label: "Quran.com", href: "https://quran.com" },
        // i18n-ignore
        { label: "mp3quran.net", href: "https://mp3quran.net" },
        // i18n-ignore
        { label: "EveryAyah", href: "https://everyayah.com" },
      ],
    },
    {
      what: t("الخطوط"),
      links: [
        // i18n-ignore
        { label: "Amiri", href: "https://www.amirifont.org" },
        // i18n-ignore
        { label: "Cairo", href: "https://github.com/Gue3bara/Cairo" },
        // i18n-ignore
        { label: "Noto", href: "https://notofonts.github.io" },
      ],
    },
  ];

  return (
    <section ref={ref} id="sources" className={`qb-reveal qb-sources${inView ? " is-in" : ""}`} aria-labelledby="sources-title">
      <h2 id="sources-title">{t("المصادر")}</h2>
      <p className="section-lead">{t("نصّ القرآن وبياناته من ناشريها، يُعرض كما نشروه ومنسوباً إليهم، ولكلٍّ شروطه.")}</p>
      <dl>
        {sources.map((source) => (
          <div key={source.what}>
            <dt>{source.what}</dt>
            <dd>
              {source.links.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                  <Icon name="arrowUpLeft" size={13} className="away" />
                </a>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <a className="qb-site-more" href={`${SOURCE_URL}/blob/main/NOTICE.md`} target="_blank" rel="noopener noreferrer">
        {t("شروط كل مصدر")}
        <Icon name="chevLeft" size={16} />
      </a>
    </section>
  );
}

/** The phone app's stores, greyed out until it is published: «قريباً». */
export function StoreBadges() {
  return (
    <div className="qb-stores" aria-label={t("تطبيق الهاتف قريباً")}>
      <span className="store" aria-disabled="true">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M4.5 2.8 14 12l-9.5 9.2A1.6 1.6 0 0 1 4 20V4c0-.5.2-.9.5-1.2zM15.3 10.7l2.6-2.5 3 1.7c1.1.6 1.1 1.6 0 2.2l-3 1.7-2.6-2.5 0-.6zM14 12l-8.2 8.4L16.6 14.1zM5.8 3.6 14 12l2.6-2.1z" fill="currentColor" />
        </svg>
        <span className="txt">
          <small>{t("قريباً على")}</small>
          {/* i18n-ignore — the store's name. */}
          <b>Google Play</b>
        </span>
      </span>
      <span className="store" aria-disabled="true">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8a4.5 4.5 0 0 0-3.8 2.3c-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.7zM14.1 5.6c.6-.8 1.1-1.8 1-2.9-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.7-1.3z" fill="currentColor" />
        </svg>
        <span className="txt">
          <small>{t("قريباً على")}</small>
          {/* i18n-ignore — the store's name. */}
          <b>App Store</b>
        </span>
      </span>
    </div>
  );
}

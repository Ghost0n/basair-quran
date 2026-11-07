import type { Metadata } from "next";

import { SiteLanding } from "@/features/site/site-landing";
import { OG_IMAGES, SITE_URL } from "@/lib/site";

import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  get title() {
    return t("بصائر القرآن — تدبّرٌ يقوم على الدليل");
  },
  get description() {
    return t("مصحفٌ أصيل، وبحثٌ دقيق في الكلمات والجذور، ودراسةٌ موجَّهة لا تستند إلا إلى الآيات.");
  },
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: "/about",
    images: OG_IMAGES,
    get title() {
      return t("بصائر القرآن — تدبّرٌ يقوم على الدليل");
    },
    get description() {
      return t("مصحفٌ أصيل، وبحثٌ دقيق في الكلمات والجذور، ودراسةٌ موجَّهة لا تستند إلا إلى الآيات.");
    },
  },
};

// What search engines read about the app (schema.org), in the source language.
// i18n-ignore
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Basair · بصائر القرآن",
  url: `${SITE_URL}/about`,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web, iOS, Android",
  inLanguage: ["ar", "en", "fr", "es", "de", "tr", "id", "ur", "fa"],
  description: "مصحفٌ أصيل، وبحثٌ دقيق في الكلمات والجذور، ودراسةٌ موجَّهة لا تستند إلا إلى الآيات.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

/** The public landing page (server-rendered for search engines and shared links). */
export default function AboutPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <SiteLanding />
    </>
  );
}

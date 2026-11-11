import type { Metadata } from "next";

import { FaqPage } from "@/features/site/faq/faq-page";
import { OG_IMAGES } from "@/lib/site";

import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  get title() {
    return t("الأسئلة الشائعة — بصائر");
  },
  get description() {
    return t("اكتب سؤالك: إن كان له جواب هنا يظهر لك فوراً، وإلا يصل إلى الفريق.");
  },
  alternates: { canonical: "/faq" },
  openGraph: { type: "article", url: "/faq", images: OG_IMAGES },
};

export default function Faq() {
  return <FaqPage />;
}

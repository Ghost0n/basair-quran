import type { Metadata } from "next";

import { GuidelinesPage } from "@/features/site/guidelines-page";
import { OG_IMAGES } from "@/lib/site";

import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  get title() {
    return t("إرشادات مجتمع بصائر");
  },
  get description() {
    return t("مجتمع للتدبّر الجادّ، يُقدَّم فيه الدليل على الرأي، ويُحترم فيه القرآن والناس.");
  },
  alternates: { canonical: "/guidelines" },
  openGraph: { type: "article", url: "/guidelines", images: OG_IMAGES },
};

export default function Guidelines() {
  return <GuidelinesPage />;
}

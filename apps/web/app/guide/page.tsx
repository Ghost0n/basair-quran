import type { Metadata } from "next";

import { GuidePage } from "@/features/site/guide/guide-page";
import { OG_IMAGES } from "@/lib/site";

import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  get title() {
    return t("دليل «بصائر»");
  },
  get description() {
    return t("كل ما في التطبيق، خطوةً خطوة: القراءة، والبحث، والتلاوة، والدراسة، والدفتر، والمجتمع.");
  },
  alternates: { canonical: "/guide" },
  openGraph: { type: "article", url: "/guide", images: OG_IMAGES },
};

export default function Guide() {
  return <GuidePage />;
}

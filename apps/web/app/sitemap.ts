import type { MetadataRoute } from "next";

import { PUBLIC_PAGES, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/** The public pages (lib/site.ts). Surah, verse and post pages join it once they have their own addresses. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({ url: `${SITE_URL}${page.path}`, changeFrequency: "weekly", priority: page.priority }));
}

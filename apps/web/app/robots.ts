import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/** Search engines may read the public pages; the API and account pages stay out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/login", "/welcome", "/research"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

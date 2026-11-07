/**
 * The public site's own address, for search engines and shared links
 * (canonical URLs, sitemap, Open Graph). Set NEXT_PUBLIC_SITE_URL to the
 * production domain at build time; without it, links stay relative and the
 * sitemap uses a local placeholder.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Public pages search engines should list (the app itself lives at "/"). */
export const PUBLIC_PAGES: readonly { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/about", priority: 0.9 },
  { path: "/guidelines", priority: 0.5 },
];

/**
 * The origin a shared link should use: the public site. Inside the standalone
 * app the page's own origin is the device (capacitor://localhost), which no
 * one else can open, so it falls back to the server the app talks to; null
 * when neither is known (the card then carries no link).
 */
export function publicOrigin(): string | null {
  if (process.env.NEXT_PUBLIC_SITE_URL) return SITE_URL;
  if (process.env.NEXT_PUBLIC_APP_MODE === "1") return (process.env.NEXT_PUBLIC_REMOTE_ORIGIN ?? "").replace(/\/$/, "") || null;
  return typeof window === "undefined" ? null : window.location.origin;
}

/** The shared-link card image (public/og-image.png, scripts/make-og-image.mjs). A page's own `openGraph` replaces the layout's, so each repeats it. */
export const OG_IMAGES = [{ url: "/og-image.png", width: 1200, height: 630 }];

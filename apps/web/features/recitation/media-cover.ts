/**
 * The now-playing cover (apps/mobile/scripts/make_icons.py): the logo on Home's
 * rosette, a full square — the lock screen and Control Center round it
 * themselves (the rounded app icon left white corners there).
 */
export const COVER_SIZES = [512, 1024] as const;

export type CoverArtwork = { src: string; sizes: string; type: string };

/** The covers as absolute URLs of the page's origin. */
export function coverArtwork(pageHref: string): CoverArtwork[] {
  return COVER_SIZES.map((size) => ({ src: new URL(`/cover-${size}.png`, pageHref).href, sizes: `${size}x${size}`, type: "image/png" }));
}

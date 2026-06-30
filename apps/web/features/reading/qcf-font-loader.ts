// On-demand loader for the QPC V1 per-page Madani glyph fonts.
//
// The authentic reader renders each word as a per-page QCF glyph code drawn by
// a page-specific WOFF2 font. There are 604 page fonts plus a shared basmala
// (ligature) font, so we load only what the current page needs via the FontFace
// API instead of declaring 604 @font-face rules. Family names match the API's
// per-line `font_family` ("qcf-p{N}", "qcf-bsml"); the file for each lives under
// the layout response's `font_base_path` (e.g. "/fonts/qpc-hafs-v1").

// Memoize per (basePath, family) so a page font is fetched at most once.
const loaded = new Map<string, Promise<boolean>>();

function fileFor(family: string): string | null {
  if (family === "qcf-bsml") return "bsml.woff2";
  const match = /^qcf-p(\d+)$/.exec(family);
  return match ? `p${match[1]}.woff2` : null;
}

/**
 * Load one glyph font and register it on `document.fonts`. Resolves `true` when
 * the font is usable, `false` on any failure (a missing page font must never
 * throw — the caller falls back to the Unicode reader instead).
 */
export function loadGlyphFont(basePath: string, family: string): Promise<boolean> {
  const file = fileFor(family);
  if (!file || !basePath) return Promise.resolve(false);
  // SSR / unsupported environments: let the caller fall back.
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.resolve(false);
  }
  const key = `${basePath}|${family}`;
  const existing = loaded.get(key);
  if (existing) return existing;

  const url = `${basePath}/${file}`;
  const face = new FontFace(family, `url("${url}") format("woff2")`, { display: "swap" });
  const promise = face
    .load()
    .then((resolved) => {
      document.fonts.add(resolved);
      return true;
    })
    .catch(() => {
      loaded.delete(key); // allow a retry on a later visit
      return false;
    });
  loaded.set(key, promise);
  return promise;
}

/**
 * Load the per-page ayah glyph font. Resolves `true` only when it is usable;
 * the basmala is rendered as Unicode text, so no basmala font is needed.
 */
export function loadPageFonts(basePath: string, page: number): Promise<boolean> {
  return loadGlyphFont(basePath, `qcf-p${page}`);
}

/** Best-effort warm of a neighbouring page font; failures are ignored. */
export function prefetchPageFont(basePath: string, page: number): void {
  if (page < 1) return;
  void loadGlyphFont(basePath, `qcf-p${page}`);
}

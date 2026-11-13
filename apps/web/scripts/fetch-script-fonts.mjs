#!/usr/bin/env node
/**
 * Self-host the Noto fonts of lib/script-fonts.ts (the faces for translations
 * and interface languages outside Arabic and Latin script).
 *
 * For every script in that file's NOTO table, the Google Fonts stylesheet and
 * its WOFF2 files are downloaded into <root>/fonts/noto/: the stylesheet as
 * <script>.css, pointing at the local files, and the files under their
 * fonts.gstatic.com path (which carries the font version, so they can be
 * cached as immutable). `ensureScriptFont` loads /fonts/noto/<script>.css; when
 * it is missing the text uses the device's fonts. This build step is the only
 * place that talks to Google: a visitor's browser never does.
 *
 *   node scripts/fetch-script-fonts.mjs            → public/ (the web app)
 *   bundleScriptFonts(out) from build-app.mjs      → out/ (the phone app, offline)
 *
 * Best effort: a script whose download fails gets no stylesheet (so the app
 * falls back to Google Fonts for it) and never fails the build. Scripts that
 * already have a stylesheet under <root> are skipped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// A current browser's user agent gets WOFF2 with unicode-range subsets, so a
// page only downloads the subsets its text uses (this matters for CJK).
const AGENT = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

/** The NOTO table of lib/script-fonts.ts: [script, Google Fonts `family=` value]. */
export function scriptFontTable(source = readFileSync(path.join(web, "lib/script-fonts.ts"), "utf-8")) {
  const table = /const NOTO[^{]*\{([\s\S]*?)\n\};/.exec(source)?.[1] ?? "";
  return [...table.matchAll(/^\s*(\w+): \{ family: "[^"]+", css: "([^"]+)" \}/gm)].map((match) => [match[1], match[2]]);
}

/** Download the stylesheet and font files of every script into <root>/fonts/noto/. */
export async function bundleScriptFonts(root) {
  const dir = path.join(root, "fonts/noto");
  const fonts = scriptFontTable();
  if (!fonts.length) {
    console.warn("script fonts not bundled (no NOTO table found in lib/script-fonts.ts)");
    return;
  }
  let bundled = 0;
  let files = 0;
  let bytes = 0;
  for (const [script, family] of fonts) {
    if (existsSync(path.join(dir, `${script}.css`))) {
      bundled += 1;
      continue;
    }
    try {
      const response = await fetch(`https://fonts.googleapis.com/css2?family=${family}&display=swap`, { headers: { "User-Agent": AGENT } });
      if (!response.ok) throw new Error(`${response.status} for the stylesheet`);
      const css = await response.text();
      const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/s\/[^)]+)\)/g)].map((match) => match[1]))];
      if (!urls.length) throw new Error("no font files in the stylesheet");
      let local = css;
      for (const url of urls) {
        const relative = new URL(url).pathname.replace(/^\/s\//, "");
        const target = path.join(dir, relative);
        if (!existsSync(target)) {
          const file = await fetch(url);
          if (!file.ok) throw new Error(`${file.status} for ${url}`);
          const data = Buffer.from(await file.arrayBuffer());
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, data);
          bytes += data.length;
        }
        local = local.split(url).join(`/fonts/noto/${relative}`);
      }
      // Visitors' browsers must never reach Google (NOTICE.md, docs/privacy-fonts.md):
      // a stylesheet that still names a Google host is not written.
      if (/fonts\.(googleapis|gstatic)\.com/.test(local)) throw new Error("the stylesheet still points at Google");
      // Written last: a stylesheet only exists once all its files do.
      writeFileSync(path.join(dir, `${script}.css`), local);
      bundled += 1;
      files += urls.length;
    } catch (error) {
      console.warn(`script font ${script} not bundled (${error.message}); its text falls back to the device's fonts`);
    }
  }
  console.log(`script fonts: ${bundled}/${fonts.length} bundled in ${dir} (${files} files downloaded, ${(bytes / 1e6).toFixed(1)} MB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await bundleScriptFonts(path.resolve(process.argv[2] ?? path.join(web, "public")));
}

#!/usr/bin/env node
/**
 * Draw public/og-image.png (1200×630), the card shown when a link to the site
 * is shared (Open Graph / X). Rendered in Chromium with the app's own fonts so
 * the Arabic is shaped correctly (server-side image renderers don't shape it).
 *
 *   node scripts/make-og-image.mjs            # needs Playwright's Chromium
 *
 * The verse is Al-Jāthiya 45:20 in the Ḥafṣ text of data/quran.db.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(web, "public");
const font = (name) => pathToFileURL(path.join(pub, "fonts", name)).href;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs"));
}

// i18n-ignore — Quran text, as in the mushaf.
const VERSE = "هَٰذَا بَصَٰٓئِرُ لِلنَّاسِ وَهُدٗى وَرَحۡمَةٌ لِّقَوۡمٖ يُوقِنُونَ";

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face { font-family: Amiri; src: url(${font("ui/amiri-700-arabic.woff2")}) format("woff2"); font-weight: 700; }
@font-face { font-family: Cairo; src: url(${font("ui/cairo-300-800-arabic.woff2")}) format("woff2"), url(${font("ui/cairo-300-800-latin.woff2")}) format("woff2"); font-weight: 300 800; }
@font-face { font-family: "Amiri Quran"; src: url(${font("AmiriQuran-Regular.ttf")}) format("truetype"); }
html, body { margin: 0; width: 1200px; height: 630px; }
body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  background: radial-gradient(60% 80% at 80% 0%, rgba(212,175,55,0.22), transparent 70%),
              radial-gradient(50% 60% at 10% 100%, rgba(120,70,30,0.25), transparent 70%), #131210;
  color: #f4ecd8; font-family: Cairo, sans-serif; }
img { width: 132px; height: 132px; }
h1 { margin: 0; font-family: Amiri, serif; font-size: 92px; line-height: 1.15; color: #e9cf73; }
p { margin: 0; font-size: 34px; color: #c7bfa8; }
.verse { margin-top: 10px; padding: 16px 38px; border-radius: 28px; border: 1px solid rgba(255,248,228,0.18);
  background: rgba(34,30,22,0.6); font-family: "Amiri Quran", serif; font-size: 38px; color: #f4ecd8; }
.latin { position: absolute; bottom: 26px; left: 40px; font-size: 24px; letter-spacing: 0.18em; color: #8d8674; direction: ltr; }
</style></head><body>
<img src="${pathToFileURL(path.join(pub, "icon.svg")).href}" alt="">
<h1>بصائر القرآن</h1>
<p>تدبّرٌ يقوم على الدليل</p>
<div class="verse">${VERSE}</div>
<div class="latin">BASAIR · QURAN STUDY</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const file = path.join(web, ".og-image.html");
writeFileSync(file, html);
await page.goto(pathToFileURL(file).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(pub, "og-image.png") });
await browser.close();
(await import("node:fs")).rmSync(file);
console.log("public/og-image.png");

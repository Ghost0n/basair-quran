#!/usr/bin/env node
/**
 * Capture the guide's screenshots and clips (docs/public-site.md → "The guide")
 * from the real app, on a phone and on a computer, in Arabic and English:
 *
 *   BASE_URL=http://127.0.0.1:3000 node scripts/capture-guide-media.mjs
 *   node scripts/capture-guide-media.mjs --lang en --platform web --only home,search
 *
 * Writes public/guide-media/<lang>/<mobile|web>/<name>.webp (screenshots, and the posters of
 * the clips) and <name>.mp4 (the clips, H.264, muted). The names are the ones
 * features/site/guide/guide-content.ts uses; its test checks every one exists.
 *
 * Needs a running app (the web and the API with data/quran.db), Playwright's
 * Chromium (not a project dependency: point PLAYWRIGHT_MODULE at an installed
 * copy if it isn't resolvable) and ffmpeg with libwebp and libx264. Run it
 * against a server with the full data (translations, published research) for
 * the richest screens. It starts as a guest on a fresh browser profile and
 * saves a few verses on the way (the notebook shot): nothing touches the server.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const LANGS = (option("lang") || "ar,en").split(",");
const PLATFORMS = (option("platform") || "mobile,web").split(",");
const ONLY = option("only")?.split(",");
const want = (name) => !ONLY || ONLY.includes(name);

// The devices, in the dark theme, and the stored width of their screenshots and clips.
const DEVICES = {
  // An iPhone 13 at 2× (the guide shows it 250 CSS px wide), full screen as the installed app is.
  mobile: { context: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" }, width: 540, cast: { maxWidth: 780, maxHeight: 1688 } },
  // A laptop's browser window.
  web: { context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" }, width: 1280, cast: { maxWidth: 1440, maxHeight: 900 } },
};

const work = mkdtempSync(path.join(tmpdir(), "qb-guide-"));
const ffmpeg = (...params) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...params], { stdio: "inherit" });

/** What the reader sees in each language: the Arabic labels, translated through the interface catalog. */
function labels(lang) {
  if (lang === "ar") return (text) => text;
  const catalog = JSON.parse(readFileSync(path.join(web, "lib/i18n/locales", `${lang}.json`), "utf8"));
  return (text) => catalog[text] ?? text;
}

// What the captures type, per language (the Quran search itself stays in Arabic).
const WORDS = {
  ar: { theme: "البصيرة", question: "ما معنى البصيرة في القرآن؟" },
  en: { theme: "Insight", question: "What does insight mean in the Quran?" },
};

async function openDevice(browser, lang, platform) {
  const device = DEVICES[platform];
  const WIDTH = device.width;
  const dir = path.join(web, "public/guide-media", lang, platform);
  const context = await browser.newContext({ ...device.context, locale: lang });
  // A guest who chose this language and has seen Home (no first-run prompts in the shots).
  await context.addInitScript((code) => {
    try {
      localStorage.setItem("qb.guest", "1");
      localStorage.setItem("qb.locale", code);
      sessionStorage.setItem("qb.landed", "1");
    } catch {}
  }, lang);
  const page = await context.newPage();
  const L = labels(lang);

  const go = async (url, settle = 2200) => {
    await page.goto(BASE_URL + url, { waitUntil: "networkidle", timeout: 120000 });
    // The development overlay never belongs in a screenshot.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.waitForTimeout(settle);
  };
  const button = (name) => page.getByRole("button", { name: L(name), exact: true }).first();
  const showBars = async () => {
    if (platform === "web") return;
    if (!(await page.locator(".qb-reader-dock .on-tool").isVisible())) {
      await page.mouse.click(195, 420);
      await page.waitForTimeout(700);
    }
  };
  const toPage = async (number) => {
    await showBars();
    if (platform === "web") await button("انتقل").click();
    else await page.locator(".qb-reader-dock .surah-btn").click();
    await page.waitForTimeout(600);
    await page.locator("[role=tab]:visible", { hasText: L("صفحة") }).first().click();
    const input = page.locator("input[inputmode=numeric]:visible").first();
    await input.fill(String(number));
    await input.press("Enter");
    await page.waitForTimeout(2600);
    if (platform === "web") {
      // «انتقل» stays open beside the Mushaf on a computer: back to the Mushaf alone.
      await button("المصحف").click();
      await page.waitForTimeout(1200);
    }
  };
  const tool = async (name) => {
    if (platform === "web") {
      // A computer shows the three tools as a radio group in the reader's bar.
      await page.getByRole("radio", { name: L(name), exact: true }).first().click();
      await page.waitForTimeout(600);
      return;
    }
    await showBars();
    await page.locator(".qb-reader-dock .on-tool").click();
    await page.waitForTimeout(500);
    await page.locator("[role=menuitemradio]:visible, [role=menuitem]:visible, button:visible", { hasText: L(name) }).last().click();
    await page.waitForTimeout(600);
  };
  const swipe = async () => {
    if (platform === "web") {
      await button("الصفحة التالية").click();
      await page.waitForTimeout(1300);
      return;
    }
    // A page turn: drag across the page (towards the reading direction's next page).
    await page.mouse.move(80, 430);
    await page.mouse.down();
    await page.mouse.move(330, 430, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(1300);
  };
  const still = async (name) => {
    if (!want(name)) return;
    const raw = path.join(work, `${lang}-${platform}-${name}.png`);
    await page.screenshot({ path: raw });
    const out = path.join(dir, `${name}.webp`);
    ffmpeg("-i", raw, "-vf", `scale=${WIDTH}:-2`, "-c:v", "libwebp", "-quality", "80", "-compression_level", "6", out);
    console.log(`  ${lang}/${platform}/${name}.webp`);
  };
  /**
   * Film the screen from now (Chromium's screencast, in device pixels: sharper
   * than Playwright's own recording); the returned function stops and saves the
   * clip as <name>.mp4 (H.264, muted) with its poster <name>.webp.
   */
  const film = async (name) => {
    const cdp = await context.newCDPSession(page);
    const frames = [];
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const file = path.join(work, `${lang}-${platform}-${name}-${String(frames.length).padStart(5, "0")}.jpg`);
      writeFileSync(file, Buffer.from(data, "base64"));
      frames.push({ file, time: metadata.timestamp });
      void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, ...device.cast, everyNthFrame: 1 });
    return async () => {
      const end = Date.now() / 1000;
      await cdp.send("Page.stopScreencast");
      if (!want(name) || frames.length < 2) return;
      // Each frame lasts until the next one (the screencast only sends changes).
      const list = frames.map((frame, index) => `file '${frame.file}'\nduration ${((frames[index + 1]?.time ?? end) - frame.time).toFixed(3)}`);
      const listFile = path.join(work, `${lang}-${platform}-${name}.txt`);
      writeFileSync(listFile, `${list.join("\n")}\nfile '${frames.at(-1).file}'\n`);
      const out = path.join(dir, name);
      ffmpeg("-f", "concat", "-safe", "0", "-i", listFile, "-vf", `scale=${WIDTH}:-2:flags=lanczos,fps=30`, "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", `${out}.mp4`);
      ffmpeg("-i", frames[0].file, "-vf", `scale=${WIDTH}:-2:flags=lanczos`, "-c:v", "libwebp", "-quality", "80", `${out}.webp`);
      console.log(`  ${lang}/${platform}/${name}.mp4 (+ poster)`);
    };
  };

  return { context, page, L, button, go, showBars, toPage, tool, swipe, still, film };
}

/** The screenshots, in one session: each step leaves what the next one shows (reading history, saved verses). */
async function stills(browser, lang, platform) {
  const phone = await openDevice(browser, lang, platform);
  const { page, L, button, go, showBars, toPage, tool, swipe, still } = phone;
  const isWeb = platform === "web";
  const words = WORDS[lang] ?? WORDS.en;

  // The reader: the opening of Al-Baqarah, then a few page turns (Home's «continue reading»).
  await go("/?mode=reading");
  await toPage(2);
  // Focus: a tap hides the phone's bars; F on a computer.
  if (isWeb) await page.keyboard.press("f");
  else await page.mouse.click(195, 420);
  await page.waitForTimeout(900);
  await still("reader-pages");
  if (isWeb) {
    await page.keyboard.press("f");
    await page.waitForTimeout(600);
  }
  await swipe();
  await swipe();
  await swipe();
  await showBars();

  // «العرض».
  if (isWeb) await button("العرض").click();
  else await page.locator(".qb-reader-dock .display-btn").click();
  await page.waitForTimeout(900);
  await still("display-menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // A word's morphology: «بصائر» in Al-Jāthiya 45:20 (page 500).
  await toPage(500);
  await tool("تحديد");
  await page.locator('[data-wk="45:20:2"]').first().click();
  await page.waitForFunction(() => !document.body.innerText.includes("جار تحميل") && !/Loading/i.test(document.querySelector(".qb-select-bar, [class*=select]")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await still("morphology");
  // Close the selection (its bar on a phone, its panel on a computer).
  if (isWeb) await go("/?mode=reading");
  else await page.locator("button:visible", { hasText: L("إلغاء التحديد") }).first().click({ timeout: 5000 }).catch(() => page.keyboard.press("Escape"));
  await page.waitForTimeout(500);

  // Save three verses under one theme (the notebook shot). Opening the Mushaf
  // resets the tool to «قراءة», so it is chosen after each jump.
  const save = async (pageNumber, wordKey, first) => {
    await toPage(pageNumber);
    await tool("تظليل");
    const word = page.locator(`[data-wk="${wordKey}"]`).first();
    if (!(await word.count())) return;
    await word.click();
    await page.waitForTimeout(1000);
    if (first) {
      await page.getByRole("textbox", { name: L("اسم الموضوع") }).fill(words.theme);
      await page.locator("button:visible", { hasText: L("إضافة") }).last().click();
    } else {
      await page.locator("button:visible", { hasText: words.theme }).first().click();
    }
    await page.waitForTimeout(600);
    await page.locator("button:visible", { hasText: L("تمّ") }).last().click();
    await page.waitForTimeout(800);
  };
  await save(500, "45:20:1", true);
  await save(141, "6:104:1", false);
  await save(248, "12:108:1", false);
  await tool("قراءة");

  // Recitation on the page of 45:20.
  await toPage(500);
  await showBars();
  if (isWeb) await button("تلاوة الصفحة").click();
  else await page.locator(".qb-reader-dock .play-btn").click();
  await page.waitForTimeout(7000);
  await still("recitation");

  // The keyboard shortcuts (a computer).
  if (isWeb) {
    await page.keyboard.press("?");
    await page.waitForTimeout(900);
    await still("shortcuts");
    await page.keyboard.press("Escape");
  }

  // A search (Home's recent searches), then the root's map.
  await go("/?mode=search");
  const input = page.locator("input[type=search]:visible, input:visible").first();
  await input.fill("صبر");
  await input.press("Enter");
  await page.waitForTimeout(2500);
  await go(`/?mode=heatmap&root=${encodeURIComponent("بصر")}`, 3000);
  await still("root-map");

  // The study, with a question ready to ask.
  await go("/?mode=studio");
  await page.locator("textarea:visible").first().fill(words.question);
  await page.waitForTimeout(600);
  await still("study");

  await go("/?mode=notebook");
  await still("notebook");

  await go("/?mode=settings");
  await still("settings");

  await go("/", 3000);
  await still("home");

  await phone.context.close();
}

/** Opening a surah from «انتقل», then turning pages. */
async function navigateClip(browser, lang, platform) {
  const phone = await openDevice(browser, lang, platform);
  const { page, button, go, swipe, film } = phone;
  await go("/?mode=reading", 2500);
  const stop = await film("reader-navigate");
  await page.waitForTimeout(600);
  if (platform === "web") await button("انتقل").click();
  else await page.locator(".qb-reader-dock .surah-btn").click();
  await page.waitForTimeout(1100);
  await page.locator("input[type=search]:visible, input:visible").first().pressSequentially("18", { delay: 260 });
  await page.waitForTimeout(900);
  // After «18» only Al-Kahf is left in the list.
  await page.locator("ul.surahs li button:visible").first().click();
  await page.waitForTimeout(1800);
  await swipe();
  await page.waitForTimeout(500);
  await swipe();
  await page.waitForTimeout(900);
  await stop();
  await phone.context.close();
}

/** Typing a word, the results, scrolling them. */
async function searchClip(browser, lang, platform) {
  const phone = await openDevice(browser, lang, platform);
  const { page, go, film } = phone;
  await go("/?mode=search", 2500);
  const stop = await film("search");
  const input = page.locator("input[type=search]:visible, input:visible").first();
  await input.click();
  await page.waitForTimeout(400);
  await input.pressSequentially("بصائر", { delay: 230 });
  await page.waitForTimeout(900);
  await input.press("Enter");
  await page.waitForTimeout(2000);
  // Scroll the results (whatever scrolls under them: the page or a panel).
  const [x, y] = platform === "web" ? [1000, 640] : [195, 620];
  await page.evaluate(([px, py]) => {
    let node = document.elementFromPoint(px, py);
    while (node && node !== document.body && !(/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight)) node = node.parentElement;
    (node && node !== document.body ? node : document.scrollingElement).scrollBy({ top: 700, behavior: "smooth" });
  }, [x, y]);
  await page.waitForTimeout(1600);
  await page.waitForTimeout(1400);
  await stop();
  await phone.context.close();
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  for (const lang of LANGS) {
    for (const platform of PLATFORMS) {
      mkdirSync(path.join(web, "public/guide-media", lang, platform), { recursive: true });
      console.log(`${lang} · ${platform}`);
      await stills(browser, lang, platform);
      if (want("reader-navigate")) await navigateClip(browser, lang, platform);
      if (want("search")) await searchClip(browser, lang, platform);
    }
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

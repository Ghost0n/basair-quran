#!/usr/bin/env node
/**
 * Build the standalone app's web bundle (docs/offline-app.md):
 *
 *   1. `next build` with NEXT_PUBLIC_APP_MODE=1 → a static export in out/;
 *   2. the bundled core database → out/assets/databases/coreSQLite.db
 *      (where the native SQLite plugin looks for bundled databases), with its
 *      version in core.version;
 *   3. the interface fonts the web app takes from Google Fonts (Amiri, Cairo)
 *      → out/fonts/ui/, linked from every page, so the phone has them offline
 *      (best effort: without network the app falls back to system fonts);
 *   4. with --with-packs, the downloadable packs → out/offline/ (a local
 *      preview: the phone downloads them from NEXT_PUBLIC_PACKS_URL).
 *
 * Needs build/offline/ from `python scripts/build_offline_packs.py`.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const offline = path.resolve(process.env.QBASAIR_OFFLINE_DIR ?? path.join(web, "../../build/offline"));
const withPacks = process.argv.includes("--with-packs");

if (!existsSync(path.join(offline, "core.db"))) {
  console.error(`${offline}/core.db not found — run: python scripts/build_offline_packs.py`);
  process.exit(1);
}

const build = spawnSync(process.execPath, [path.join(web, "node_modules/next/dist/bin/next"), "build"], {
  cwd: web,
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_APP_MODE: "1", NEXT_PUBLIC_ENABLE_YAMLI: process.env.NEXT_PUBLIC_ENABLE_YAMLI ?? "0" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const out = path.join(web, "out");
mkdirSync(path.join(out, "assets/databases"), { recursive: true });
cpSync(path.join(offline, "core.db"), path.join(out, "assets/databases/coreSQLite.db"));
// The phone replaces its copy of the core only when this changes (an app update with new data).
const manifest = JSON.parse(readFileSync(path.join(offline, "manifest.json"), "utf-8"));
writeFileSync(path.join(out, "assets/databases/core.version"), `${manifest.core.version}\n`);
await bundleUiFonts(out);
rmSync(path.join(out, "offline"), { recursive: true, force: true });
if (withPacks) cpSync(offline, path.join(out, "offline"), { recursive: true });
console.log(`app bundle → ${out}${withPacks ? " (with packs under /offline)" : ""}`);

/** The Google Fonts stylesheet of app/tokens.css, with its WOFF2 files, made local. */
async function bundleUiFonts(root) {
  const tokens = readFileSync(path.join(web, "app/tokens.css"), "utf-8");
  const cssUrl = /@import url\('(https:\/\/fonts\.googleapis\.com\/[^']+)'\)/.exec(tokens)?.[1];
  if (!cssUrl) return;
  const dir = path.join(root, "fonts/ui");
  try {
    // A current browser's user agent gets WOFF2 with unicode-range subsets.
    const agent = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    const css = await (await fetch(cssUrl, { headers: { "User-Agent": agent } })).text();
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((match) => match[1]))];
    if (!urls.length) throw new Error("no font files in the stylesheet");
    mkdirSync(dir, { recursive: true });
    let local = css;
    for (const [index, url] of urls.entries()) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      const name = `f${index}.woff2`;
      writeFileSync(path.join(dir, name), Buffer.from(await response.arrayBuffer()));
      local = local.split(url).join(`/fonts/ui/${name}`);
    }
    writeFileSync(path.join(dir, "fonts.css"), local);
    const link = '<link rel="stylesheet" href="/fonts/ui/fonts.css"/>';
    for (const file of readdirSync(root).filter((name) => name.endsWith(".html"))) {
      const target = path.join(root, file);
      writeFileSync(target, readFileSync(target, "utf-8").replace("</head>", `${link}</head>`));
    }
    console.log(`interface fonts bundled (${urls.length} files)`);
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    console.warn(`interface fonts not bundled (${error.message}); the app will use them online or fall back to system fonts`);
  }
}

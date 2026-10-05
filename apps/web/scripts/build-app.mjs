#!/usr/bin/env node
/**
 * Build the standalone app's web bundle (docs/offline-app.md):
 *
 *   1. `next build` with NEXT_PUBLIC_APP_MODE=1 → a static export in out/;
 *   2. the bundled core database → out/assets/databases/coreSQLite.db
 *      (where the native SQLite plugin looks for bundled databases), with its
 *      version in core.version;
 *   3. with --with-packs, the downloadable packs → out/offline/ (a local
 *      preview: the phone downloads them from NEXT_PUBLIC_PACKS_URL).
 *
 * Needs build/offline/ from `python scripts/build_offline_packs.py`.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
rmSync(path.join(out, "offline"), { recursive: true, force: true });
if (withPacks) cpSync(offline, path.join(out, "offline"), { recursive: true });
console.log(`app bundle → ${out}${withPacks ? " (with packs under /offline)" : ""}`);

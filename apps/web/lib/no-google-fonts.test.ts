import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A visitor's browser never contacts Google's font servers (docs/privacy-fonts.md):
 * no page, stylesheet, component or public file may name them, and the security
 * policy nginx sends must not allow them. The only exception is the build step
 * that downloads the fonts to self-host them (scripts/fetch-script-fonts.mjs).
 */
const WEB = path.resolve(__dirname, "..");
const REPO = path.resolve(WEB, "../..");
const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/;
const SOURCE = /\.(tsx?|jsx?|mjs|css|html|json|svg|webmanifest)$/;

/** Files under `dir`, skipping dependencies, build output and the generated (ignored) font copies. */
function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "out", "noto", "qpc-hafs-v1", "guide-media"].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (SOURCE.test(name)) out.push(full);
  }
  return out;
}

describe("no Google Fonts in the browser", () => {
  it("no page, component, stylesheet or public file names a Google font host", () => {
    const offenders = ["app", "features", "components", "lib", "public"]
      .flatMap((dir) => files(path.join(WEB, dir)))
      .filter((file) => !file.endsWith("no-google-fonts.test.ts"))
      .filter((file) => GOOGLE_FONTS.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(REPO, file));
    expect(offenders).toEqual([]);
  });

  it("the content security policy only allows our own fonts and stylesheets", () => {
    for (const name of ["http.conf.template", "tls.conf.template"]) {
      const conf = readFileSync(path.join(REPO, "deploy/nginx", name), "utf8");
      expect(conf, name).not.toMatch(GOOGLE_FONTS);
      const csp = conf.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? "";
      expect(csp, name).toMatch(/font-src 'self' data:;/);
      expect(csp, name).toMatch(/style-src 'self' 'unsafe-inline';/);
    }
  });
});

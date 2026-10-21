import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PHONE_QUERY } from "./phone-query";
import { WEB_DESIGN_INIT_SCRIPT, isWebDesign } from "./web-design";

const webRoot = path.resolve(__dirname, "..");

/** Every `*.web.css` file of the web app (the web design's styles). */
function webCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "out") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...webCssFiles(full));
    else if (name.endsWith(".web.css") || name === "web-design.css") out.push(full);
  }
  return out;
}

/** Top-level selectors of a stylesheet (outside @keyframes), comments removed. */
function selectors(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  let inKeyframes = 0;
  for (const ch of clean) {
    if (ch === "{") {
      const head = buf.trim();
      if (/^@keyframes/.test(head)) inKeyframes = depth + 1;
      else if (!head.startsWith("@") && !inKeyframes) out.push(...head.split(",").map((s) => s.trim()));
      depth += 1;
      buf = "";
    } else if (ch === "}") {
      depth -= 1;
      if (inKeyframes && depth < inKeyframes) inKeyframes = 0;
      buf = "";
    } else if (ch === ";" ) {
      buf = "";
    } else {
      buf += ch;
    }
  }
  return out.filter(Boolean);
}

describe("web design gate", () => {
  it("applies on the web, not in the native app nor on phones", () => {
    expect(isWebDesign(false, false)).toBe(true);
    expect(isWebDesign(true, false)).toBe(false);
    expect(isWebDesign(false, true)).toBe(false);
    expect(isWebDesign(true, true)).toBe(false);
  });

  it("decides before paint with the same phone query as the phone layout", () => {
    expect(WEB_DESIGN_INIT_SCRIPT).toContain(JSON.stringify(PHONE_QUERY));
    expect(WEB_DESIGN_INIT_SCRIPT).toContain("qb-web");
  });

  it("scopes every web-design rule under .qb-web, so phones and the app are untouched", () => {
    const files = webCssFiles(webRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const sel of selectors(readFileSync(file, "utf8"))) {
        expect(sel, `${path.relative(webRoot, file)}: ${sel}`).toMatch(/^(html\.qb-web|\.qb-web)\b/);
      }
    }
  });
});

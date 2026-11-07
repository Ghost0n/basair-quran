import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

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
  it("applies at every width and in the native app", () => {
    expect(isWebDesign()).toBe(true);
  });

  it("adds qb-web before paint, on a phone and in the app alike", () => {
    const classes = new Set<string>();
    const document = {
      documentElement: {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
          toggle: (c: string, on?: boolean) => (on === false ? classes.delete(c) : classes.add(c)),
        },
      },
    };
    const phone = { matches: true, addEventListener: () => {} };
    const window = { matchMedia: () => phone };
    new Function("window", "document", WEB_DESIGN_INIT_SCRIPT)(window, document);
    expect([...classes]).toEqual(["qb-web"]);
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

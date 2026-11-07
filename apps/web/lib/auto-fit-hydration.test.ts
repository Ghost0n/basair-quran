import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sources(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("auto-fit and hydration", () => {
  it("marks every data-autofit element as script-managed (no hydration mismatch on data-fit)", () => {
    const missing: string[] = [];
    for (const dir of ["app", "components", "features", "lib"]) {
      for (const file of sources(path.join(webRoot, dir))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (/data-autofit=/.test(line) && !/suppressHydrationWarning/.test(line)) {
              missing.push(`${path.relative(webRoot, file)}:${index + 1}`);
            }
          });
      }
    }
    expect(missing).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Android's back button closes the newest open sheet through sheetStack
// (lib/app-back.ts). A sheet that never registers there is skipped: back
// leaves the page instead. Every dialog goes through useDialog, so useDialog
// registers, and every .qb-rsheet must be a useDialog (or the shared Sheet).

const ROOT = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("Android back reaches every sheet", () => {
  it("useDialog registers its close with sheetStack", () => {
    const source = readFileSync(join(ROOT, "lib/use-dialog.ts"), "utf8");
    expect(source).toMatch(/sheetStack\.push\(/);
  });

  it("every .qb-rsheet is opened through useDialog or the shared Sheet", () => {
    const missing = [...sources(join(ROOT, "features")), ...sources(join(ROOT, "components"))]
      .filter((path) => /className="qb-rsheet[\s"]/.test(readFileSync(path, "utf8")))
      .filter((path) => !/useDialog</.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path).split("\\").join("/"));
    expect(missing).toEqual([]);
  });
});

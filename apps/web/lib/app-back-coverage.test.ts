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

// A .qb-rsheet root, written as a plain or a template-literal class name.
const SHEET = /className=(?:"|\{`)qb-rsheet(?=[\s"`$])/g;
const DIALOG = /useDialog</g;

/** How many .qb-rsheet roots in a file have no useDialog of their own. */
function uncoveredSheets(source: string): number {
  const sheets = source.match(SHEET)?.length ?? 0;
  const dialogs = source.match(DIALOG)?.length ?? 0;
  return Math.max(0, sheets - dialogs);
}

describe("the coverage guard itself", () => {
  it("sees a sheet whose class name is a template literal", () => {
    expect(uncoveredSheets('<div className={`qb-rsheet${open ? " is-open" : ""}`}>')).toBe(1);
  });

  it("sees a second sheet in a file that has one useDialog", () => {
    const source = 'const a = useDialog<HTMLDivElement>(close); <div className="qb-rsheet"/> <div className="qb-rsheet is-tall"/>';
    expect(uncoveredSheets(source)).toBe(1);
  });

  it("passes a file with a dialog for each sheet, and ignores other classes", () => {
    const source = 'useDialog<HTMLDivElement>(close); <div className="qb-rsheet"/> <div className="qb-rsheet-grip"/>';
    expect(uncoveredSheets(source)).toBe(0);
  });
});

describe("Android back reaches every sheet", () => {
  it("useDialog registers its close with sheetStack", () => {
    const source = readFileSync(join(ROOT, "lib/use-dialog.ts"), "utf8");
    expect(source).toMatch(/sheetStack\.push\(/);
  });

  it("every .qb-rsheet is opened through useDialog or the shared Sheet", () => {
    const missing = [...sources(join(ROOT, "features")), ...sources(join(ROOT, "components"))]
      .filter((path) => uncoveredSheets(readFileSync(path, "utf8")) > 0)
      .map((path) => relative(ROOT, path).split("\\").join("/"));
    expect(missing).toEqual([]);
  });
});

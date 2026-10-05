import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error -- a plain .mjs build script, no type declarations
import { scriptFontTable } from "../scripts/fetch-script-fonts.mjs";

type FakeLink = { rel: string; href: string; dataset: Record<string, string>; onerror: (() => void) | null };

function stubDocument() {
  const appended: FakeLink[] = [];
  vi.stubGlobal("document", {
    createElement: () => ({ rel: "", href: "", dataset: {}, onerror: null }),
    head: { appendChild: (link: FakeLink) => appended.push(link) },
  });
  return appended;
}

async function freshModule() {
  vi.resetModules();
  return import("./script-fonts");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ensureScriptFont", () => {
  it("loads the self-hosted stylesheet once per script", async () => {
    const appended = stubDocument();
    const { ensureScriptFont } = await freshModule();
    ensureScriptFont("hi");
    ensureScriptFont("mr"); // same script (Devanagari)
    ensureScriptFont("en"); // Latin: covered by Cairo
    ensureScriptFont("ar");
    expect(appended).toHaveLength(1);
    expect(appended[0].href).toBe("/fonts/noto/devanagari.css");
    expect(appended[0].dataset.scriptFont).toBe("devanagari");
  });

  it("falls back to Google Fonts when the self-hosted stylesheet fails", async () => {
    const appended = stubDocument();
    const { ensureScriptFont } = await freshModule();
    ensureScriptFont("ja");
    appended[0].onerror?.();
    expect(appended[0].href).toBe("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&display=swap");
    expect(appended[0].onerror).toBeNull();
  });
});

describe("fetch-script-fonts", () => {
  it("reads every script of the NOTO table", async () => {
    const { scriptFamily } = await freshModule();
    const table: [string, string][] = scriptFontTable();
    expect(table.length).toBeGreaterThan(15);
    expect(table).toContainEqual(["cyrillic", "Noto+Sans:wght@400;600;700"]);
    expect(table).toContainEqual(["zh", "Noto+Sans+SC:wght@400;600"]);
    // Every language with a Noto face gets a stylesheet the build downloads.
    const downloaded = new Set(table.map(([, css]) => css.split(":")[0].replaceAll("+", " ")));
    for (const lang of ["ru", "ur", "bn", "hi", "ta", "ml", "te", "kn", "gu", "si", "am", "th", "zh", "ja", "ko", "he", "dv"]) {
      expect(downloaded).toContain(scriptFamily(lang));
    }
    const scripts = new Set(table.map(([script]) => script));
    expect(scripts.size).toBe(table.length);
  });
});

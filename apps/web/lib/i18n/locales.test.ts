import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import catalog from "./catalog.json";
import { LOCALES, matchLocale } from "./locales";
import { interpolate, setActiveDictionary, t } from "./translate";

const dir = path.join(__dirname, "locales");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("interface locales", () => {
  it("has a dictionary for every non-source locale, and nothing else", () => {
    const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => name.replace(".json", "")).sort();
    expect(files).toEqual(LOCALES.map((l) => l.code).filter((c) => c !== "ar").sort());
  });

  for (const locale of LOCALES.filter((l) => l.code !== "ar")) {
    it(`${locale.code}: covers the catalog with matching placeholders`, () => {
      const messages = JSON.parse(fs.readFileSync(path.join(dir, `${locale.code}.json`), "utf8")) as Record<string, string>;
      const missing = (catalog as string[]).filter((id) => !messages[id]?.trim());
      expect(missing).toEqual([]);
      for (const id of catalog as string[]) expect(placeholders(messages[id]), id).toBe(placeholders(id));
      // Quran text is never a message id.
      expect(Object.keys(messages).some((id) => /[ٱۖ-ۭ]/.test(id))).toBe(false);
    });
  }
});

describe("t()", () => {
  it("falls back to the fallback dictionary, then the Arabic source, and fills placeholders", () => {
    setActiveDictionary("fr", { "صفحة {0}": "Page {0}" }, { الآن: "Just now" });
    expect(t("صفحة {0}", { 0: 5 })).toBe("Page 5");
    expect(t("الآن")).toBe("Just now");
    expect(t("غير مترجم")).toBe("غير مترجم");
    setActiveDictionary("ar", {}, null);
    expect(t("صفحة {0}", { 0: 5 })).toBe("صفحة 5");
    expect(interpolate("{a} {b} {c}", { a: 1, b: "x" })).toBe("1 x {c}");
  });

  it("matches browser languages to supported locales", () => {
    expect(matchLocale(["fr-CA"])).toBe("fr");
    expect(matchLocale(["xx", "ur-PK"])).toBe("ur");
    expect(matchLocale(["ja"])).toBe("ar");
  });
});

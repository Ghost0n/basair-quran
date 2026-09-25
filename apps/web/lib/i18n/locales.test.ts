import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import catalog from "./catalog.json";
import { LOCALES, matchLocale } from "./locales";
import plurals from "./plurals.json";
import { AR_PLURALS } from "./plurals-ar";
import { interpolate, setActiveDictionary, t, tn, type Message } from "./translate";

const dir = path.join(__dirname, "locales");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const pluralIds = new Set(plurals as string[]);
// Categories a plural entry must spell out besides `other` (Romance "many" is for millions).
const required = (code: string) =>
  new Intl.PluralRules(code)
    .resolvedOptions()
    .pluralCategories.filter((name) => name !== "other" && name !== "zero" && !(name === "many" && ["fr", "es", "pt", "it", "ca"].includes(code)));

describe("interface locales", () => {
  it("has a dictionary for every non-source locale, and nothing else", () => {
    const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => name.replace(".json", "")).sort();
    expect(files).toEqual(LOCALES.map((l) => l.code).filter((c) => c !== "ar").sort());
  });

  for (const locale of LOCALES.filter((l) => l.code !== "ar")) {
    it(`${locale.code}: covers the catalog with matching placeholders`, () => {
      const messages = JSON.parse(fs.readFileSync(path.join(dir, `${locale.code}.json`), "utf8")) as Record<string, Message>;
      const missing = (catalog as string[]).filter((id) => {
        const value = messages[id];
        return !(typeof value === "string" ? value.trim() : value?.other?.trim());
      });
      expect(missing).toEqual([]);
      for (const id of catalog as string[]) {
        const value = messages[id];
        if (pluralIds.has(id)) {
          const forms = typeof value === "string" ? { other: value } : value;
          for (const name of required(locale.code)) expect(forms[name as keyof typeof forms], `${id} [${name}]`).toBeTruthy();
          // A form may drop the number («آية واحدة», "one verse") but never invent a placeholder.
          const allowed = placeholders(id).split(",");
          for (const form of Object.values(forms)) {
            for (const name of placeholders(form ?? "").split(",").filter(Boolean)) expect(allowed, `${id}: {${name}}`).toContain(name);
          }
        } else {
          expect(typeof value, id).toBe("string");
          expect(placeholders(value as string), id).toBe(placeholders(id));
        }
      }
      // Quran text is never a message id.
      expect(Object.keys(messages).some((id) => /[ٱۖ-ۭ]/.test(id))).toBe(false);
    });
  }
});

describe("Arabic plural forms", () => {
  it("covers every counted phrase with all six categories", () => {
    expect(Object.keys(AR_PLURALS).sort()).toEqual([...(plurals as string[])].sort());
    for (const [id, forms] of Object.entries(AR_PLURALS)) {
      for (const name of ["zero", "one", "two", "few", "many", "other"] as const) expect(forms[name], `${id} [${name}]`).toBeTruthy();
    }
  });
});

describe("tn()", () => {
  it("picks the CLDR category of the active locale", () => {
    setActiveDictionary("ar", {}, null);
    const ar = (n: number) => tn("{0} آية", n, { 0: n });
    expect([ar(1), ar(2), ar(3), ar(11), ar(100)]).toEqual(["آية واحدة", "آيتان", "3 آيات", "11 آية", "100 آية"]);

    setActiveDictionary("ru", { "{0} آية": { one: "{0} аят", few: "{0} аята", many: "{0} аятов", other: "{0} аята" } }, null);
    expect([1, 3, 5, 21].map((n) => tn("{0} آية", n, { 0: n }))).toEqual(["1 аят", "3 аята", "5 аятов", "21 аят"]);
  });

  it("uses the fallback locale's rules for fallback entries, and `other` for plain strings", () => {
    setActiveDictionary("id", {}, { "{0} آية": { one: "{0} verse", other: "{0} verses" } }, "en");
    expect(tn("{0} آية", 1, { 0: 1 })).toBe("1 verse");
    setActiveDictionary("fr", { "{0} آية": "{0} versets" }, null);
    expect(tn("{0} آية", 1, { 0: 1 })).toBe("1 versets");
    expect(t("{0} آية", { 0: 4 })).toBe("4 versets");
    setActiveDictionary("ar", {}, null);
  });
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
    expect(matchLocale(["kk"])).toBe("ar");
  });
});

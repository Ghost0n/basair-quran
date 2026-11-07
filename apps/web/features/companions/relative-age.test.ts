import { afterEach, describe, expect, it } from "vitest";

import { setActiveDictionary } from "@/lib/i18n";

import { relativeAge } from "./use-companions";

const now = () => Math.floor(Date.now() / 1000);
const plain = (n: number | string) => String(n);

describe("relativeAge", () => {
  afterEach(() => setActiveDictionary("ar", {}, null));

  it("uses Intl where the runtime has data for the locale", () => {
    setActiveDictionary("fr", {}, null);
    expect(relativeAge(now() - 3 * 3600, plain)).toBe("il y a 3 heures");
  });

  it("falls back to the dictionary's plural phrases when Intl has no data", () => {
    // An unknown code resolves to another locale in Intl, so the dictionary is used.
    setActiveDictionary("xx", { "قبل {0} ساعة": { other: "{0}h ago (xx)" } }, null);
    expect(relativeAge(now() - 5 * 3600, plain)).toBe("5h ago (xx)");
  });

  it("uses the Arabic source forms when nothing else applies", () => {
    setActiveDictionary("xx", {}, null);
    expect(relativeAge(now() - 2 * 86400, plain)).toBe("قبل يومين");
  });
});

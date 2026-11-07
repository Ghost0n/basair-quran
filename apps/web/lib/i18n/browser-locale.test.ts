import { describe, expect, it } from "vitest";

import { LOCALE_INIT_SCRIPT } from "./init-script";
import { matchLocale } from "./locales";

describe("matchLocale", () => {
  it("takes the first language the app speaks, by its base language", () => {
    expect(matchLocale(["fr-CA", "en-US"])).toBe("fr");
    expect(matchLocale(["xx", "pt-BR"])).toBe("pt");
    expect(matchLocale(["zh-Hans-CN"])).toBe("zh");
    expect(matchLocale(["in-ID"])).toBe("id");
    expect(matchLocale(["ar-EG", "en"])).toBe("ar");
  });

  it("stays Arabic when nothing matches", () => {
    expect(matchLocale(["xx-YY"])).toBe("ar");
    expect(matchLocale([])).toBe("ar");
    expect(matchLocale(undefined)).toBe("ar");
  });
});

describe("LOCALE_INIT_SCRIPT", () => {
  // Runs the inline script against a fake document/navigator, as the browser would before first paint.
  function run(stored: string | null, languages: string[]) {
    const root = { lang: "ar", dir: "rtl", dataset: {} as Record<string, string> };
    const env = {
      localStorage: { getItem: () => stored },
      document: { documentElement: root },
      navigator: { languages, language: languages[0] },
      setTimeout: () => 0,
    };
    new Function("localStorage", "document", "navigator", "setTimeout", LOCALE_INIT_SCRIPT)(
      env.localStorage,
      env.document,
      env.navigator,
      env.setTimeout,
    );
    return root;
  }

  it("applies a saved choice first, then the browser's language", () => {
    expect(run("en", ["fr-FR"]).lang).toBe("en");
    const french = run(null, ["fr-FR", "en"]);
    expect([french.lang, french.dir, french.dataset.i18nPending]).toEqual(["fr", "ltr", "1"]);
    expect(run(null, ["ur-PK"]).dir).toBe("rtl");
    expect(run(null, ["xx"]).lang).toBe("ar");
    expect(run(null, ["ar-SA"]).dataset.i18nPending).toBeUndefined();
  });
});

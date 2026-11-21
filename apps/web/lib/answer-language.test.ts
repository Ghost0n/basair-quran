// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { forgetAccountOnThisDevice } from "./forget-account";
import {
  ANSWER_LANGUAGE_KEY,
  answerLanguageChoice,
  answerLanguageName,
  answerLocale,
  resetAnswerLanguageForTests,
  setAnswerLanguage,
} from "./answer-language";
import { LOCALE_CODES } from "./i18n";

beforeEach(() => {
  window.localStorage.clear();
  resetAnswerLanguageForTests();
});

describe("the study's answer language", () => {
  it("follows the interface language until one is chosen", () => {
    expect(answerLanguageChoice()).toBe("auto");
    expect(answerLocale("auto", "fr")).toBe("fr");
    expect(answerLanguageName(answerLocale("auto", "fr"))).toBe("french");
  });

  it("keeps a chosen language on this device, across sign-out", () => {
    setAnswerLanguage("ur");
    expect(answerLocale(answerLanguageChoice(), "en")).toBe("ur");
    forgetAccountOnThisDevice();
    resetAnswerLanguageForTests();
    expect(window.localStorage.getItem(ANSWER_LANGUAGE_KEY)).toBe("ur");
    expect(answerLanguageChoice()).toBe("ur");
    setAnswerLanguage("auto");
    expect(window.localStorage.getItem(ANSWER_LANGUAGE_KEY)).toBeNull();
  });

  it("ignores a value that is no interface language", () => {
    window.localStorage.setItem(ANSWER_LANGUAGE_KEY, "klingon");
    expect(answerLanguageChoice()).toBe("auto");
  });

  it("names every interface language for the research agent", () => {
    for (const code of LOCALE_CODES) expect(answerLanguageName(code)).toMatch(/^[a-z]+$/);
    expect(answerLanguageName("ar")).toBe("arabic");
  });
});

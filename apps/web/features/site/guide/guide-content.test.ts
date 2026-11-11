import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GUIDE_PLATFORMS, guideChapters, mediaLanguage, mediaPath } from "./guide-content";

const PUBLIC = path.resolve(__dirname, "../../../public");

describe("the guide", () => {
  for (const platform of GUIDE_PLATFORMS) {
    const chapters = guideChapters(platform);
    const topics = chapters.flatMap((chapter) => chapter.topics);

    it(`${platform}: every chapter and topic has its own link and some steps`, () => {
      const ids = [...chapters.map((chapter) => chapter.id), ...topics.map((topic) => topic.id)];
      expect(new Set(ids).size).toBe(ids.length);
      for (const topic of topics) {
        expect(topic.title && topic.summary).toBeTruthy();
        expect(topic.steps.length).toBeGreaterThan(0);
      }
    });

    it(`${platform}: every screenshot and clip exists, in Arabic and English`, () => {
      for (const locale of ["ar", "en"]) {
        for (const topic of topics) {
          if (!topic.media) continue;
          const files = [mediaPath(locale, platform, topic.media)];
          if (topic.media.kind === "video") files.push(mediaPath(locale, platform, topic.media, true));
          for (const file of files) expect(existsSync(path.join(PUBLIC, file)), file).toBe(true);
        }
      }
    });
  }

  it("keeps what needs the phone app out of the computer's guide", () => {
    const web = guideChapters("web").flatMap((chapter) => chapter.topics);
    expect(web.some((topic) => topic.appOnly)).toBe(false);
    expect(web.map((topic) => topic.id)).toContain("shortcuts");
    expect(guideChapters("mobile").flatMap((chapter) => chapter.topics).map((topic) => topic.id)).not.toContain("shortcuts");
  });

  it("shows Arabic screens to right-to-left languages and English ones to the others", () => {
    expect(["ar", "fa", "ur"].map(mediaLanguage)).toEqual(["ar", "ar", "ar"]);
    expect(["en", "fr", "id", "zh"].map(mediaLanguage)).toEqual(["en", "en", "en", "en"]);
  });
});

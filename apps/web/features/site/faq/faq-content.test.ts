import { describe, expect, it } from "vitest";

import { GUIDE_PLATFORMS, guideChapters } from "../guide/guide-content";
import { faqGroups } from "./faq-content";
import { ANSWERED, rankFaq } from "./faq-match";

const entries = faqGroups().flatMap((group) => group.entries);

describe("the FAQ", () => {
  it("has one link per answer", () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points each «read the steps» link to a topic of the guide", () => {
    const topics = new Set(GUIDE_PLATFORMS.flatMap((platform) => guideChapters(platform).flatMap((chapter) => chapter.topics.map((topic) => topic.id))));
    for (const entry of entries) if (entry.guide) expect(topics.has(entry.guide), entry.guide).toBe(true);
  });

  it("answers each of its own questions with its own answer", () => {
    for (const entry of entries) {
      const [top] = rankFaq(entry.question, entries);
      expect(top?.id, entry.question).toBe(entry.id);
      expect(top!.score).toBeGreaterThanOrEqual(ANSWERED);
    }
  });
});

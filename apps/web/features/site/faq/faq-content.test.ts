import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

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

describe("the FAQ in every interface language", () => {
  const dir = path.resolve(__dirname, "../../../lib/i18n/locales");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const locale = file.replace(/\.json$/, "");
    it(`${locale}: each translated question finds its own answer`, () => {
      const catalog = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Record<string, string>;
      const tr = (text: string) => catalog[text] ?? text;
      const local = entries.map((entry) => ({ id: entry.id, question: tr(entry.question), keywords: tr(entry.keywords), answer: tr(entry.answer) }));
      const misses = local.filter((entry) => {
        const [top] = rankFaq(entry.question, local);
        return top?.id !== entry.id || top.score < ANSWERED;
      });
      expect(misses.map((entry) => entry.question)).toEqual([]);
    });
  }
});

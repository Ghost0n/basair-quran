import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { GUIDELINES } from "./guidelines-content";

const ROOT = resolve(__dirname, "../../../..");

describe("the community guidelines", () => {
  it("match their reference text, docs/community-guidelines.md (generated from the Arabic)", () => {
    const doc = readFileSync(resolve(ROOT, "docs/community-guidelines.md"), "utf8");
    const ar = GUIDELINES.ar;
    expect(doc).toContain(`# ${ar.title}`);
    expect(doc).toContain(`> ${ar.intro}`);
    for (const section of ar.sections) {
      expect(doc).toContain(`## ${section.title}`);
      for (const item of section.items) expect(doc).toContain(item);
    }
  });

  it("have the same sections in Arabic and English", () => {
    expect(GUIDELINES.en.sections.map((section) => section.items.length)).toEqual(GUIDELINES.ar.sections.map((section) => section.items.length));
  });

  it("stay neutral: no school, sect or tradition is named, praised or targeted", () => {
    const text = JSON.stringify(GUIDELINES);
    for (const word of ["حديث", "أحاديث", "طائف", "مذهب", "الصحابة", "تكفير", "تبديع", "hadith", "sectarian", "Companions", "fatwa"]) {
      expect(text, word).not.toContain(word);
    }
  });
});

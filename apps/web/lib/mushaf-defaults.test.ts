import { describe, expect, it } from "vitest";

import { DEFAULT_EDITION, DEFAULT_MUSHAF_ID, MUSHAF_EDITIONS, resolveEdition } from "./mushaf-defaults";

describe("mushaf editions", () => {
  it("defaults to the authentic Madani Ḥafṣ edition", () => {
    expect(DEFAULT_EDITION.id).toBe("madani-hafs");
    expect(DEFAULT_EDITION.authentic).toBe(true);
    expect(DEFAULT_EDITION.riwayah).toBe("hafs");
    expect(DEFAULT_MUSHAF_ID).toBe(2);
  });

  it("resolves a known edition and falls back for unknown or missing ids", () => {
    expect(resolveEdition("madani-hafs")).toBe(DEFAULT_EDITION);
    expect(resolveEdition("qaloun-text")).toBe(DEFAULT_EDITION);
    expect(resolveEdition(undefined)).toBe(DEFAULT_EDITION);
  });

  it("keeps edition ids unique", () => {
    const ids = MUSHAF_EDITIONS.map((edition) => edition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { describe, expect, it } from "vitest";

import { WIDE_MIN, bandFor } from "./bands";

describe("bandFor", () => {
  it("puts a desktop window in the wide band", () => {
    expect(bandFor(1440, 900, false)).toBe("wide");
    expect(bandFor(WIDE_MIN, 800, false)).toBe("wide");
  });

  it("puts a narrowed window or an upright tablet in the medium band", () => {
    expect(bandFor(1099, 800, false)).toBe("medium");
    expect(bandFor(769, 1024, true)).toBe("medium");
  });

  it("puts a phone in either orientation in the phone band", () => {
    expect(bandFor(768, 1024, true)).toBe("phone");
    expect(bandFor(844, 390, true)).toBe("phone");
  });

  it("keeps a short window with a mouse out of the phone band", () => {
    expect(bandFor(844, 390, false)).toBe("medium");
  });
});

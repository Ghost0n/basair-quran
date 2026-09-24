import { describe, expect, it } from "vitest";

import { DEFAULT_MUSHAF_ID, pickDefaultMushaf } from "./mushaf-defaults";

describe("pickDefaultMushaf", () => {
  it("prefers Ḥafṣ by riwāyah key, whatever the catalog order", () => {
    const items = [
      { id: 1, name: "قالون", riwayah: "qaloun" },
      { id: 7, name: "حفص", riwayah: "hafs" },
    ];
    expect(pickDefaultMushaf(items)).toBe(7);
  });

  it("falls back to the Ḥafṣ id, then to the first mushaf", () => {
    expect(pickDefaultMushaf([{ id: 1, name: "قالون" }, { id: DEFAULT_MUSHAF_ID, name: "حفص" }])).toBe(
      DEFAULT_MUSHAF_ID,
    );
    expect(pickDefaultMushaf([{ id: 3, name: "ورش", riwayah: "warsh" }])).toBe(3);
  });

  it("returns the Ḥafṣ id for an empty catalog", () => {
    expect(pickDefaultMushaf([])).toBe(DEFAULT_MUSHAF_ID);
  });
});

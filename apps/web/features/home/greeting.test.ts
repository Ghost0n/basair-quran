import { describe, expect, it } from "vitest";

import { momentOf } from "./greeting";

// Dates checked against the Umm al-Qura calendar.
describe("home greeting moment", () => {
  it("knows Ramadan and Eid", () => {
    expect(momentOf(new Date(2026, 1, 25, 10), null)).toBe("ramadan"); // 8 Ramadan 1447
    expect(momentOf(new Date(2026, 2, 21, 10), null)).toBe("eid"); // 2 Shawwal 1447
  });

  it("welcomes back after a week away, else follows the hour", () => {
    const now = new Date(2026, 9, 5, 9);
    expect(momentOf(now, now.getTime() - 10 * 86400000)).toBe("back");
    expect(momentOf(now, now.getTime() - 86400000)).toBe("morning");
    expect(momentOf(new Date(2026, 9, 5, 20), null)).toBe("evening");
  });
});

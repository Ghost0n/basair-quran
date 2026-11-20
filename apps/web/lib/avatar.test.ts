import { describe, expect, it } from "vitest";

import { automaticAvatar, avatarInitial, avatarLook, formatAvatar, parseAvatar } from "./avatar";

describe("the medallion (lib/avatar.ts)", () => {
  it("takes the first letter of the name — in Arabic past «ال» and the vowel marks", () => {
    expect(avatarInitial("عبد الله")).toBe("ع");
    expect(avatarInitial("الحسن")).toBe("ح");
    expect(avatarInitial("آل")).toBe("آ");
    expect(avatarInitial("  مُحَمَّد ")).toBe("م");
    expect(avatarInitial("sarah connor")).toBe("S");
    expect(avatarInitial("Émile")).toBe("É");
    expect(avatarInitial("  ", "zaid@example.test")).toBe("Z");
    expect(avatarInitial(null, null)).toBe("ب");
  });

  it("gives each account a pattern and a colour from its id, the same every time, never plain", () => {
    expect(automaticAvatar(42)).toEqual(automaticAvatar("42"));
    const looks = Array.from({ length: 200 }, (_, id) => automaticAvatar(id));
    expect(new Set(looks.map((look) => look.pattern)).size).toBe(5);
    expect(new Set(looks.map((look) => look.tone)).size).toBe(6);
    expect(looks.some((look) => look.pattern === "plain")).toBe(false);
  });

  it("saves a choice as p<pattern>t<tone>, and reads the former medallions as no choice", () => {
    const saved = formatAvatar({ pattern: "shamsa", tone: "lapis" });
    expect(saved).toBe("p4t1");
    expect(saved.length).toBeLessThanOrEqual(8);
    expect(parseAvatar(saved)).toEqual({ pattern: "shamsa", tone: "lapis" });
    expect(parseAvatar("ba")).toBeNull();
    expect(parseAvatar("star8")).toBeNull();
    expect(parseAvatar("p9t1")).toBeNull();
    expect(avatarLook("ba", 7)).toEqual(automaticAvatar(7));
    expect(avatarLook("p5t0", 7)).toEqual({ pattern: "plain", tone: "gold" });
  });
});

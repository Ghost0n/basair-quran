import { describe, expect, it } from "vitest";

import { sanitizeNextPath } from "./identity-flow";

describe("sanitizeNextPath", () => {
  it("passes through a plain same-origin path", () => {
    expect(sanitizeNextPath("/reader/2/255")).toBe("/reader/2/255");
    expect(sanitizeNextPath("/")).toBe("/");
  });

  it("falls back to / for empty or non-absolute input", () => {
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath(undefined)).toBe("/");
    expect(sanitizeNextPath("")).toBe("/");
    expect(sanitizeNextPath("evil.com")).toBe("/");
    expect(sanitizeNextPath("\\evil.com")).toBe("/");
  });

  it("rejects protocol-relative and scheme-relative bypasses", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/");
    // The backslash bypass that this fix closes.
    expect(sanitizeNextPath("/\\evil.com")).toBe("/");
  });

  it("rejects tab/newline-smuggled protocol-relative URLs", () => {
    expect(sanitizeNextPath("/\t/evil.com")).toBe("/");
    expect(sanitizeNextPath("/\n/evil.com")).toBe("/");
  });
});

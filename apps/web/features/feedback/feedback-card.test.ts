import { describe, expect, it } from "vitest";

import { emailSyntaxProblem } from "./feedback-card";

describe("a guest's email in «الدعم والملاحظات»", () => {
  it("is required", () => {
    expect(emailSyntaxProblem("")).toBe("email_required");
    expect(emailSyntaxProblem("   ")).toBe("email_required");
  });

  it("accepts what the server accepts", () => {
    for (const email of ["name@gmail.com", " Name+tag@GMAIL.com ", "first.last@sub.example.co.uk", "a@xn--mgbh0fb.xn--kgbechtv"]) {
      expect(emailSyntaxProblem(email)).toBeNull();
    }
  });

  it("refuses a malformed address before sending", () => {
    for (const email of ["plain", "two@@at.com", "@gmail.com", "name@", "a..b@gmail.com", ".a@gmail.com", "a b@gmail.com", "a@gmail", "a@gmail.c", "a@-x.com"]) {
      expect(emailSyntaxProblem(email)).toBe("email_invalid");
    }
  });
});

import { describe, it, expect } from "vitest";
import { parseCcInput, sanitizeCcList, MAX_CC_RECIPIENTS } from "@/server/services/cc-emails";

describe("parseCcInput", () => {
  it("splits on commas, semicolons, and whitespace", () => {
    expect(parseCcInput("a@b.com, c@d.com; e@f.com\ng@h.com")).toEqual([
      "a@b.com",
      "c@d.com",
      "e@f.com",
      "g@h.com",
    ]);
  });

  it("drops invalid tokens silently", () => {
    expect(parseCcInput("good@x.com, not-an-email, also@bad")).toEqual(["good@x.com"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCcInput("")).toEqual([]);
    expect(parseCcInput("   ")).toEqual([]);
  });
});

describe("sanitizeCcList", () => {
  it("returns an empty array when cc is missing", () => {
    expect(sanitizeCcList(undefined, "to@x.com")).toEqual([]);
    expect(sanitizeCcList(null, "to@x.com")).toEqual([]);
    expect(sanitizeCcList([], "to@x.com")).toEqual([]);
  });

  it("dedupes case-insensitively", () => {
    expect(sanitizeCcList(["A@X.com", "a@x.com", "b@x.com"], "to@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("drops the primary recipient if it appears in the cc list", () => {
    expect(sanitizeCcList(["to@x.com", "cc@x.com"], "TO@X.com")).toEqual(["cc@x.com"]);
  });

  it("filters out invalid email shapes", () => {
    expect(sanitizeCcList(["ok@x.com", "bad", "also@bad"], "to@x.com")).toEqual(["ok@x.com"]);
  });

  it(`caps at ${MAX_CC_RECIPIENTS}`, () => {
    const many = Array.from({ length: 20 }, (_, i) => `user${i}@x.com`);
    const result = sanitizeCcList(many, "to@x.com");
    expect(result).toHaveLength(MAX_CC_RECIPIENTS);
    expect(result[0]).toBe("user0@x.com");
  });

  it("handles an array `to` (drops any matching cc)", () => {
    expect(
      sanitizeCcList(["a@x.com", "b@x.com", "c@x.com"], ["a@x.com", "c@x.com"])
    ).toEqual(["b@x.com"]);
  });
});

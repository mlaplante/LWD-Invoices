import { describe, it, expect } from "vitest";
import { proposalSectionsSchema, validateSections } from "../server/routers/proposal-templates-helpers";

describe("proposalSectionsSchema", () => {
  it("accepts valid sections array", () => {
    const valid = [
      { key: "executive_summary", title: "Executive Summary", content: "Some content" },
      { key: "budget", title: "Budget", content: null },
    ];
    expect(() => proposalSectionsSchema.parse(valid)).not.toThrow();
  });

  it("rejects sections without key", () => {
    const invalid = [{ title: "No Key", content: "text" }];
    expect(() => proposalSectionsSchema.parse(invalid)).toThrow();
  });

  it("rejects empty array", () => {
    const invalid: unknown[] = [];
    expect(() => proposalSectionsSchema.parse(invalid)).toThrow();
  });
});

describe("validateSections", () => {
  it("returns true for valid default section keys", () => {
    const sections = [
      { key: "executive_summary", title: "Executive Summary", content: "text" },
      { key: "budget", title: "Budget", content: null },
    ];
    expect(validateSections(sections)).toBe(true);
  });

  it("allows custom section keys", () => {
    const sections = [
      { key: "custom_section", title: "Custom", content: "text" },
    ];
    expect(validateSections(sections)).toBe(true);
  });

  it("rejects duplicate keys", () => {
    const sections = [
      { key: "executive_summary", title: "Exec 1", content: "a" },
      { key: "executive_summary", title: "Exec 2", content: "b" },
    ];
    expect(validateSections(sections)).toBe(false);
  });
});

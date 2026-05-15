import { describe, it, expect } from "vitest";
import { buildDigestBody } from "../inngest/functions/retention-checkins";
import { emptyCounts, totalNewCheckIns } from "../server/services/check-in-generator";

describe("buildDigestBody", () => {
  it("reports zero-new when nothing surfaced but queue isn't empty", () => {
    const out = buildDigestBody(emptyCounts(), 4);
    expect(out).toContain("No new check-ins surfaced this week.");
    expect(out).toContain("4 pending in queue.");
  });

  it("itemizes counts when present", () => {
    const counts = { projectClose: 1, thirtyDay: 2, quarterly: 3, annual: 1 };
    const out = buildDigestBody(counts, 7);
    expect(out).toContain("7 new check-ins surfaced");
    expect(out).toContain("2 30-day follow-ups");
    expect(out).toContain("3 quarterly check-ins");
    expect(out).toContain("1 annual revisit");
    expect(out).toContain("1 project close");
    expect(out).toContain("7 pending in queue.");
  });

  it("singularizes properly for counts of 1", () => {
    const counts = { projectClose: 0, thirtyDay: 1, quarterly: 1, annual: 1 };
    const out = buildDigestBody(counts, 1);
    expect(out).toContain("3 new check-ins"); // total stays plural
    expect(out).toContain("1 30-day follow-up");
    expect(out).not.toContain("1 30-day follow-ups");
    expect(out).toContain("1 pending in queue.");
  });

  it("omits zero-count categories from itemization", () => {
    const counts = { projectClose: 0, thirtyDay: 0, quarterly: 2, annual: 0 };
    const out = buildDigestBody(counts, 2);
    expect(out).toContain("2 new check-ins");
    expect(out).toContain("2 quarterly check-ins");
    expect(out).not.toContain("30-day");
    expect(out).not.toContain("annual");
    expect(out).not.toContain("project close");
  });
});

describe("totalNewCheckIns", () => {
  it("sums all four categories", () => {
    expect(totalNewCheckIns({ projectClose: 1, thirtyDay: 2, quarterly: 3, annual: 4 })).toBe(10);
  });

  it("is zero for empty counts", () => {
    expect(totalNewCheckIns(emptyCounts())).toBe(0);
  });
});

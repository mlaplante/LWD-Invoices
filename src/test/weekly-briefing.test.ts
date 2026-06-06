import { describe, it, expect } from "vitest";
import { briefingHeadline } from "@/server/services/weekly-briefing";
import { briefingDueForOrg } from "@/inngest/functions/weekly-briefing";

describe("briefingHeadline", () => {
  it("leads with overdue total and count", () => {
    const h = briefingHeadline({
      currencySymbol: "$",
      overdueTotal: 12500,
      overdueCount: 3,
      atRiskCount: 2,
      projected30: 8000,
    });
    expect(h).toContain("$12,500 overdue across 3 invoices");
    expect(h).toContain("2 clients at risk");
    expect(h).toContain("$8,000 projected to land in the next 30 days");
    expect(h.endsWith(".")).toBe(true);
  });

  it("reads cleanly with nothing overdue", () => {
    const h = briefingHeadline({
      currencySymbol: "$",
      overdueTotal: 0,
      overdueCount: 0,
      atRiskCount: 0,
      projected30: 0,
    });
    expect(h.startsWith("Nothing overdue")).toBe(true);
  });

  it("singularizes a single overdue invoice and at-risk client", () => {
    const h = briefingHeadline({
      currencySymbol: "£",
      overdueTotal: 100,
      overdueCount: 1,
      atRiskCount: 1,
      projected30: null,
    });
    expect(h).toContain("£100 overdue across 1 invoice");
    expect(h).toContain("1 client at risk");
    expect(h).not.toContain("projected to land");
  });
});

describe("briefingDueForOrg", () => {
  const now = new Date("2026-06-08T13:00:00Z"); // a Monday

  it("is due when never sent", () => {
    expect(briefingDueForOrg(now, null)).toBe(true);
  });

  it("is not due when sent within the last 6 days", () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
    expect(briefingDueForOrg(now, twoDaysAgo)).toBe(false);
  });

  it("is due again after 6+ days", () => {
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    expect(briefingDueForOrg(now, weekAgo)).toBe(true);
  });
});

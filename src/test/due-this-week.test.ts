import { describe, it, expect } from "vitest";

export function buildDueThisWeekWhere(orgId: string, now: Date) {
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 999);

  return {
    organizationId: orgId,
    status: { in: ["SENT", "PARTIALLY_PAID"] as const },
    isArchived: false,
    dueDate: { gte: now, lte: endOfWeek },
  };
}

describe("buildDueThisWeekWhere", () => {
  it("sets date range from now to 7 days ahead", () => {
    const now = new Date("2026-04-05T12:00:00Z");
    const where = buildDueThisWeekWhere("org1", now);
    expect(where.dueDate.gte).toEqual(now);
    expect(where.dueDate.lte.getDate()).toBe(12);
    expect(where.dueDate.lte.getHours()).toBe(23);
  });

  it("excludes archived invoices", () => {
    const now = new Date();
    const where = buildDueThisWeekWhere("org1", now);
    expect(where.isArchived).toBe(false);
  });

  it("only includes SENT and PARTIALLY_PAID statuses", () => {
    const now = new Date();
    const where = buildDueThisWeekWhere("org1", now);
    expect(where.status.in).toEqual(["SENT", "PARTIALLY_PAID"]);
  });
});

import { describe, it, expect } from "vitest";
import { calcDaysOverdue } from "@/inngest/functions/overdue-invoices";

describe("calcDaysOverdue", () => {
  it("returns 1 for an invoice exactly 1 day overdue", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    const due = new Date("2026-03-09T12:00:00Z");
    expect(calcDaysOverdue(now, due)).toBe(1);
  });

  it("returns 30 for an invoice 30 days overdue", () => {
    const now = new Date("2026-04-10T00:00:00Z");
    const due = new Date("2026-03-11T00:00:00Z");
    expect(calcDaysOverdue(now, due)).toBe(30);
  });

  it("floors partial days (0.75 days overdue → 0)", () => {
    const now = new Date("2026-03-10T06:00:00Z"); // 18h after due
    const due = new Date("2026-03-09T12:00:00Z");
    expect(calcDaysOverdue(now, due)).toBe(0);
  });

  it("returns 0 when due date equals now", () => {
    const now = new Date("2026-03-10T00:00:00Z");
    expect(calcDaysOverdue(now, now)).toBe(0);
  });
});

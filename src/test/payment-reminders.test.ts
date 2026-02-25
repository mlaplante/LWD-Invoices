import { describe, it, expect } from "vitest";
import { calcDaysUntilDue, getReminderWindow } from "@/inngest/functions/payment-reminders";

describe("calcDaysUntilDue", () => {
  it("returns 1 for an invoice due in exactly 1 day", () => {
    const now = new Date("2026-03-09T12:00:00Z");
    const due = new Date("2026-03-10T12:00:00Z");
    expect(calcDaysUntilDue(now, due)).toBe(1);
  });

  it("returns 3 for an invoice due in exactly 3 days", () => {
    const now = new Date("2026-03-07T00:00:00Z");
    const due = new Date("2026-03-10T00:00:00Z");
    expect(calcDaysUntilDue(now, due)).toBe(3);
  });

  it("ceils partial days (1.5 days → 2)", () => {
    const now = new Date("2026-03-09T06:00:00Z");
    const due = new Date("2026-03-10T18:00:00Z"); // 36h later
    expect(calcDaysUntilDue(now, due)).toBe(2);
  });
});

describe("getReminderWindow", () => {
  it("tomorrow starts at UTC midnight", () => {
    const now = new Date("2026-03-09T15:30:00Z");
    const { tomorrow } = getReminderWindow(now);
    expect(tomorrow.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("in3Days ends at UTC 23:59:59.999", () => {
    const now = new Date("2026-03-09T15:30:00Z");
    const { in3Days } = getReminderWindow(now);
    expect(in3Days.toISOString()).toBe("2026-03-12T23:59:59.999Z");
  });

  it("advances correctly from the end of a month", () => {
    const now = new Date("2026-03-29T10:00:00Z");
    const { tomorrow, in3Days } = getReminderWindow(now);
    expect(tomorrow.toISOString()).toBe("2026-03-30T00:00:00.000Z");
    expect(in3Days.toISOString()).toBe("2026-04-01T23:59:59.999Z");
  });
});

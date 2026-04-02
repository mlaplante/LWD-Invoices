import { describe, it, expect } from "vitest";
import { calcDaysUntilDue, getQueryWindow, shouldSendReminder } from "@/inngest/functions/payment-reminders";

describe("calcDaysUntilDue", () => {
  it("returns 1 when cron fires at 8am and invoice is due tomorrow midnight", () => {
    const now = new Date("2026-03-10T08:00:00Z");
    const due = new Date("2026-03-11T00:00:00Z");
    expect(calcDaysUntilDue(now, due)).toBe(1);
  });

  it("returns 3 when cron fires at 8am and invoice is due in 3 days", () => {
    const now = new Date("2026-03-10T08:00:00Z");
    const due = new Date("2026-03-13T00:00:00Z");
    expect(calcDaysUntilDue(now, due)).toBe(3);
  });

  it("returns 1 for a non-midnight due date on the same calendar day as tomorrow", () => {
    const now = new Date("2026-03-10T08:00:00Z");
    const due = new Date("2026-03-11T18:00:00Z");
    expect(calcDaysUntilDue(now, due)).toBe(1);
  });

  it("returns 0 when cron fires at 8am and invoice is due today", () => {
    const now = new Date("2026-03-10T08:00:00Z");
    const due = new Date("2026-03-10T00:00:00Z");
    expect(calcDaysUntilDue(now, due)).toBe(0);
  });
});

describe("getQueryWindow", () => {
  it("from starts at UTC midnight tomorrow", () => {
    const now = new Date("2026-03-09T15:30:00Z");
    const { from } = getQueryWindow(now);
    expect(from.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("to ends at UTC 23:59:59.999 ninety days out", () => {
    const now = new Date("2026-03-09T15:30:00Z");
    const { to } = getQueryWindow(now);
    expect(to.toISOString()).toBe("2026-06-07T23:59:59.999Z");
  });

  it("advances correctly from the end of a month", () => {
    const now = new Date("2026-03-29T10:00:00Z");
    const { from, to } = getQueryWindow(now);
    expect(from.toISOString()).toBe("2026-03-30T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-06-27T23:59:59.999Z");
  });
});

describe("shouldSendReminder", () => {
  it("uses override when non-empty", () => {
    expect(shouldSendReminder(2, [2, 7], [1, 3])).toBe(true);
    expect(shouldSendReminder(3, [2, 7], [1, 3])).toBe(false);
  });

  it("falls back to org days when override is empty", () => {
    expect(shouldSendReminder(3, [], [1, 3])).toBe(true);
    expect(shouldSendReminder(2, [], [1, 3])).toBe(false);
  });

  it("returns false when daysUntilDue not in either list", () => {
    expect(shouldSendReminder(5, [], [1, 3])).toBe(false);
    expect(shouldSendReminder(5, [2, 7], [1, 3])).toBe(false);
  });
});

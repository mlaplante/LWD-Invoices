import { describe, it, expect } from "vitest";
import {
  calcDaysUntilDue,
  getQueryWindow,
  shouldSendReminder,
} from "@/inngest/functions/payment-reminders";

describe("Payment Reminders Inngest Function", () => {
  describe("calcDaysUntilDue", () => {
    it("returns 0 when due date is today", () => {
      const now = new Date("2026-02-26T12:00:00Z");
      const dueDate = new Date("2026-02-26T18:00:00Z");

      const result = calcDaysUntilDue(now, dueDate);

      expect(result).toBe(0);
    });

    it("returns positive days when due date is in future", () => {
      const now = new Date("2026-02-26T00:00:00Z");
      const dueDate = new Date("2026-03-01T00:00:00Z");

      const result = calcDaysUntilDue(now, dueDate);

      expect(result).toBe(3);
    });

    it("returns negative days when due date is in past", () => {
      const now = new Date("2026-02-26T00:00:00Z");
      const dueDate = new Date("2026-02-20T00:00:00Z");

      const result = calcDaysUntilDue(now, dueDate);

      expect(result).toBe(-6);
    });

    it("handles same date different times correctly", () => {
      const now = new Date("2026-02-26T23:59:59Z");
      const dueDate = new Date("2026-02-26T00:00:00Z");

      const result = calcDaysUntilDue(now, dueDate);

      expect(result).toBe(0);
    });

    it("handles one day difference", () => {
      const now = new Date("2026-02-26T00:00:00Z");
      const dueDate = new Date("2026-02-27T00:00:00Z");

      const result = calcDaysUntilDue(now, dueDate);

      expect(result).toBe(1);
    });

    it("handles leap year correctly", () => {
      const now = new Date("2024-02-28T00:00:00Z"); // 2024 is leap year
      const dueDate = new Date("2024-03-01T00:00:00Z");

      const result = calcDaysUntilDue(now, dueDate);

      expect(result).toBe(2); // Feb 29 + Mar 1
    });

    it("handles year boundaries", () => {
      const now = new Date("2026-12-31T00:00:00Z");
      const dueDate = new Date("2027-01-01T00:00:00Z");

      const result = calcDaysUntilDue(now, dueDate);

      expect(result).toBe(1);
    });

    it("handles month boundaries", () => {
      const now = new Date("2026-01-31T00:00:00Z");
      const dueDate = new Date("2026-02-28T00:00:00Z");

      const result = calcDaysUntilDue(now, dueDate);

      expect(result).toBe(28);
    });
  });

  describe("getQueryWindow", () => {
    it("returns 90-day window starting tomorrow", () => {
      const now = new Date("2026-02-26T00:00:00Z");

      const { from, to } = getQueryWindow(now);

      // Should start tomorrow at midnight
      expect(from.toISOString()).toBe("2026-02-27T00:00:00.000Z");
      // Should end 90 days out at end of day
      expect(to.toISOString()).toBe("2026-05-27T23:59:59.999Z");
    });

    it("excludes today from window", () => {
      const now = new Date("2026-02-26T12:00:00Z");

      const { from } = getQueryWindow(now);

      // From should be tomorrow, not today
      expect(from.getUTCDate()).toBe(27);
      expect(from.getUTCMonth()).toBe(1); // February
    });

    it("includes exactly 90 days", () => {
      const now = new Date("2026-02-26T00:00:00Z");

      const { from, to } = getQueryWindow(now);

      const daysDiff = Math.round(
        (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBe(90);
    });

    it("window spans across month boundaries", () => {
      const now = new Date("2026-02-26T00:00:00Z");

      const { to } = getQueryWindow(now);

      // Should be in May
      expect(to.getUTCMonth()).toBe(4); // May (0-indexed)
    });

    it("window spans across year boundaries for dates near year end", () => {
      const now = new Date("2026-11-15T00:00:00Z");

      const { to } = getQueryWindow(now);

      // Should span into next year
      expect(to.getUTCFullYear()).toBe(2027);
    });

    it("sets from to start of day", () => {
      const now = new Date("2026-02-26T15:30:45Z");

      const { from } = getQueryWindow(now);

      expect(from.getUTCHours()).toBe(0);
      expect(from.getUTCMinutes()).toBe(0);
      expect(from.getUTCSeconds()).toBe(0);
      expect(from.getUTCMilliseconds()).toBe(0);
    });

    it("sets to to end of day", () => {
      const now = new Date("2026-02-26T15:30:45Z");

      const { to } = getQueryWindow(now);

      expect(to.getUTCHours()).toBe(23);
      expect(to.getUTCMinutes()).toBe(59);
      expect(to.getUTCSeconds()).toBe(59);
      expect(to.getUTCMilliseconds()).toBe(999);
    });
  });

  describe("shouldSendReminder", () => {
    it("returns true when days matches organization defaults", () => {
      const daysUntilDue = 3;
      const override: number[] = [];
      const orgDays = [1, 3, 7];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      expect(result).toBe(true);
    });

    it("returns false when days doesn't match organization defaults", () => {
      const daysUntilDue = 5;
      const override: number[] = [];
      const orgDays = [1, 3, 7];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      expect(result).toBe(false);
    });

    it("uses override when present", () => {
      const daysUntilDue = 5;
      const override = [5, 10];
      const orgDays = [1, 3, 7];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      expect(result).toBe(true);
    });

    it("ignores org days when override is present", () => {
      const daysUntilDue = 3;
      const override = [5, 10];
      const orgDays = [1, 3, 7];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      // Should return false because 3 is not in override
      expect(result).toBe(false);
    });

    it("returns false with empty override and empty org days", () => {
      const daysUntilDue = 5;
      const override: number[] = [];
      const orgDays: number[] = [];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      expect(result).toBe(false);
    });

    it("matches first element in override", () => {
      const daysUntilDue = 1;
      const override = [1, 3, 7];

      const result = shouldSendReminder(daysUntilDue, override, []);

      expect(result).toBe(true);
    });

    it("matches last element in override", () => {
      const daysUntilDue = 30;
      const override = [1, 7, 30];

      const result = shouldSendReminder(daysUntilDue, override, []);

      expect(result).toBe(true);
    });

    it("handles zero days", () => {
      const daysUntilDue = 0;
      const override: number[] = [];
      const orgDays = [0, 1, 3];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      expect(result).toBe(true);
    });

    it("handles negative days (overdue)", () => {
      const daysUntilDue = -5;
      const override: number[] = [];
      const orgDays = [-5, -1, 1, 3];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      expect(result).toBe(true);
    });

    it("prefers override over org days", () => {
      const daysUntilDue = 2;
      const override = [2, 5];
      const orgDays = [1, 3, 7];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      expect(result).toBe(true);
    });

    it("ignores org days entirely when override exists", () => {
      const daysUntilDue = 7;
      const override = [1];
      const orgDays = [1, 3, 7];

      const result = shouldSendReminder(daysUntilDue, override, orgDays);

      // 7 is in orgDays but override is [1], so should be false
      expect(result).toBe(false);
    });
  });
});

import { describe, it, expect } from "vitest";

type ScheduledReportInput = {
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
};

export function validateScheduleFields(input: ScheduledReportInput): string | null {
  if (input.frequency === "WEEKLY") {
    if (input.dayOfWeek === undefined || input.dayOfWeek === null) {
      return "dayOfWeek is required for WEEKLY frequency";
    }
    if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
      return "dayOfWeek must be 0-6";
    }
  }
  if (input.frequency === "MONTHLY" || input.frequency === "QUARTERLY") {
    if (input.dayOfMonth === undefined || input.dayOfMonth === null) {
      return "dayOfMonth is required for MONTHLY/QUARTERLY frequency";
    }
    if (input.dayOfMonth < 1 || input.dayOfMonth > 28) {
      return "dayOfMonth must be 1-28";
    }
  }
  return null;
}

export function isDueToday(
  now: Date,
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY",
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  lastSentAt: Date | null
): boolean {
  if (frequency === "WEEKLY") {
    if (dayOfWeek === null) return false;
    if (now.getUTCDay() !== dayOfWeek) return false;
    // Must not have been sent within last 6 days
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 6) return false;
    }
    return true;
  }
  if (frequency === "MONTHLY") {
    if (dayOfMonth === null) return false;
    if (now.getUTCDate() !== dayOfMonth) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 25) return false;
    }
    return true;
  }
  if (frequency === "QUARTERLY") {
    if (dayOfMonth === null) return false;
    if (now.getUTCDate() !== dayOfMonth) return false;
    // Quarters: months 0,3,6,9 (Jan, Apr, Jul, Oct)
    const quarterMonths = [0, 3, 6, 9];
    if (!quarterMonths.includes(now.getUTCMonth())) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 80) return false;
    }
    return true;
  }
  return false;
}

describe("validateScheduleFields", () => {
  it("requires dayOfWeek for WEEKLY", () => {
    expect(validateScheduleFields({ frequency: "WEEKLY" })).toBe(
      "dayOfWeek is required for WEEKLY frequency"
    );
  });

  it("validates dayOfWeek range", () => {
    expect(validateScheduleFields({ frequency: "WEEKLY", dayOfWeek: 7 })).toBe(
      "dayOfWeek must be 0-6"
    );
  });

  it("accepts valid WEEKLY", () => {
    expect(validateScheduleFields({ frequency: "WEEKLY", dayOfWeek: 1 })).toBeNull();
  });

  it("requires dayOfMonth for MONTHLY", () => {
    expect(validateScheduleFields({ frequency: "MONTHLY" })).toBe(
      "dayOfMonth is required for MONTHLY/QUARTERLY frequency"
    );
  });

  it("validates dayOfMonth range", () => {
    expect(validateScheduleFields({ frequency: "MONTHLY", dayOfMonth: 31 })).toBe(
      "dayOfMonth must be 1-28"
    );
  });

  it("accepts valid MONTHLY", () => {
    expect(validateScheduleFields({ frequency: "MONTHLY", dayOfMonth: 15 })).toBeNull();
  });

  it("accepts valid QUARTERLY", () => {
    expect(validateScheduleFields({ frequency: "QUARTERLY", dayOfMonth: 1 })).toBeNull();
  });
});

describe("isDueToday", () => {
  it("returns true for matching WEEKLY day", () => {
    // 2026-04-06 is a Monday (day 1)
    const now = new Date("2026-04-06T10:00:00Z");
    expect(isDueToday(now, "WEEKLY", 1, null, null)).toBe(true);
  });

  it("returns false for non-matching WEEKLY day", () => {
    const now = new Date("2026-04-06T10:00:00Z"); // Monday
    expect(isDueToday(now, "WEEKLY", 5, null, null)).toBe(false);
  });

  it("returns false if sent within last 6 days (WEEKLY)", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    const lastSent = new Date("2026-04-01T10:00:00Z"); // 5 days ago
    expect(isDueToday(now, "WEEKLY", 1, null, lastSent)).toBe(false);
  });

  it("returns true for matching MONTHLY day", () => {
    const now = new Date("2026-04-15T10:00:00Z");
    expect(isDueToday(now, "MONTHLY", null, 15, null)).toBe(true);
  });

  it("returns false for QUARTERLY on non-quarter month", () => {
    const now = new Date("2026-05-01T10:00:00Z"); // May is not a quarter start
    expect(isDueToday(now, "QUARTERLY", null, 1, null)).toBe(false);
  });

  it("returns true for QUARTERLY on quarter month", () => {
    const now = new Date("2026-04-01T10:00:00Z"); // April = month 3 = quarter start
    expect(isDueToday(now, "QUARTERLY", null, 1, null)).toBe(true);
  });
});

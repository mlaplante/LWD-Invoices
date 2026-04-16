import { describe, it, expect } from "vitest";
import { Prisma } from "@/generated/prisma";
import {
  calculateUsedHours,
  calculateRemaining,
  isPeriodCurrent,
  resolvePeriodLabel,
  defaultPeriodBounds,
  sanitizeTimeEntryForPortal,
} from "@/server/services/hours-retainers";

describe("calculateUsedHours", () => {
  it("returns 0 for no entries", () => {
    expect(calculateUsedHours([]).toString()).toBe("0");
  });

  it("sums minutes and converts to hours", () => {
    const entries = [
      { minutes: new Prisma.Decimal(60) },
      { minutes: new Prisma.Decimal(30) },
      { minutes: new Prisma.Decimal(90) },
    ];
    expect(calculateUsedHours(entries).toString()).toBe("3");
  });

  it("handles fractional minutes", () => {
    const entries = [
      { minutes: new Prisma.Decimal(45) },
      { minutes: new Prisma.Decimal(15) },
    ];
    expect(calculateUsedHours(entries).toString()).toBe("1");
  });
});

describe("calculateRemaining", () => {
  it("returns remaining when under budget", () => {
    const r = calculateRemaining(new Prisma.Decimal(20), new Prisma.Decimal(12.5));
    expect(r.remaining.toString()).toBe("7.5");
    expect(r.overBy).toBeNull();
  });

  it("returns zero remaining at exact limit", () => {
    const r = calculateRemaining(new Prisma.Decimal(20), new Prisma.Decimal(20));
    expect(r.remaining.toString()).toBe("0");
    expect(r.overBy).toBeNull();
  });

  it("reports overBy when over budget", () => {
    const r = calculateRemaining(new Prisma.Decimal(20), new Prisma.Decimal(22.5));
    expect(r.remaining.toString()).toBe("0");
    expect(r.overBy?.toString()).toBe("2.5");
  });
});

describe("isPeriodCurrent", () => {
  it("true when now is inside bounds", () => {
    const p = { periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-04-30") };
    expect(isPeriodCurrent(p, new Date("2026-04-15"))).toBe(true);
  });
  it("false when now is after end", () => {
    const p = { periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-04-30") };
    expect(isPeriodCurrent(p, new Date("2026-05-01"))).toBe(false);
  });
  it("true at the exact start date", () => {
    const p = { periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-04-30") };
    expect(isPeriodCurrent(p, new Date("2026-04-01"))).toBe(true);
  });

  it("true on the last calendar day of the period after midnight UTC", () => {
    const { start, end } = defaultPeriodBounds(new Date("2026-04-15T00:00:00Z"));
    const bounds = { periodStart: start, periodEnd: end };
    expect(isPeriodCurrent(bounds, new Date("2026-04-30T12:00:00Z"))).toBe(true);
    expect(isPeriodCurrent(bounds, new Date("2026-04-30T23:59:59Z"))).toBe(true);
  });

  it("false at the start of the next month", () => {
    const { start, end } = defaultPeriodBounds(new Date("2026-04-15T00:00:00Z"));
    const bounds = { periodStart: start, periodEnd: end };
    expect(isPeriodCurrent(bounds, new Date("2026-05-01T00:00:00Z"))).toBe(false);
  });
});

describe("resolvePeriodLabel", () => {
  it("returns Month YYYY", () => {
    expect(resolvePeriodLabel(new Date("2026-04-16"))).toBe("April 2026");
    expect(resolvePeriodLabel(new Date("2026-12-01"))).toBe("December 2026");
  });
});

describe("defaultPeriodBounds", () => {
  it("returns first/last day for 30-day month", () => {
    const b = defaultPeriodBounds(new Date("2026-04-16"));
    expect(b.start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(b.end.toISOString().slice(0, 10)).toBe("2026-04-30");
    expect(b.end.toISOString()).toBe("2026-04-30T23:59:59.999Z");
  });
  it("handles 31-day month", () => {
    const b = defaultPeriodBounds(new Date("2026-01-15"));
    expect(b.end.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(b.end.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });
  it("handles February leap year (2028)", () => {
    const b = defaultPeriodBounds(new Date("2028-02-15"));
    expect(b.end.toISOString().slice(0, 10)).toBe("2028-02-29");
  });
  it("handles February non-leap year", () => {
    const b = defaultPeriodBounds(new Date("2026-02-15"));
    expect(b.end.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("sanitizeTimeEntryForPortal", () => {
  const raw = {
    id: "te_1",
    date: new Date("2026-04-14"),
    minutes: new Prisma.Decimal(120),
    note: "DO NOT LEAK — internal debugging notes",
    userId: "user_1",
    projectId: null,
    retainerId: "hr_1",
    organizationId: "org_1",
  };

  it("returns only date and hours", () => {
    const out = sanitizeTimeEntryForPortal(raw);
    expect(Object.keys(out).sort()).toEqual(["date", "hours"]);
    expect(out.date).toEqual(raw.date);
    expect(out.hours.toString()).toBe("2");
  });

  it("NEVER includes the note field", () => {
    const out = sanitizeTimeEntryForPortal(raw);
    expect("note" in out).toBe(false);
    expect(JSON.stringify(out)).not.toContain("DO NOT LEAK");
  });

  it("NEVER includes admin identity fields", () => {
    const out = sanitizeTimeEntryForPortal(raw);
    expect("userId" in out).toBe(false);
    expect("organizationId" in out).toBe(false);
  });
});

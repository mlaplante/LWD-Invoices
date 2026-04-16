import { describe, it, expect } from "vitest";
import { Prisma } from "@/generated/prisma";
import { calculateUsedHours, calculateRemaining } from "@/server/services/hours-retainers";

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

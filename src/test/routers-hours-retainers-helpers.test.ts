import { describe, it, expect } from "vitest";
import { Prisma } from "@/generated/prisma";
import { calculateUsedHours } from "@/server/services/hours-retainers";

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

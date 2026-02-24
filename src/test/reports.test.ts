import { describe, it, expect } from "vitest";
import { groupByMonth } from "@/server/routers/reports";

describe("groupByMonth", () => {
  it("groups dates by month key", () => {
    const items = [
      { date: new Date("2026-01-15"), amount: 100 },
      { date: new Date("2026-01-28"), amount: 50 },
      { date: new Date("2026-02-10"), amount: 200 },
    ];
    const result = groupByMonth(items, (i) => i.date, (i) => i.amount);
    expect(result["2026-01"]).toBe(150);
    expect(result["2026-02"]).toBe(200);
  });
  it("returns empty object for empty input", () => {
    const result = groupByMonth([], () => new Date(), () => 0);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

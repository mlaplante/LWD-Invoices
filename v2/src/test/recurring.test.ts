import { describe, it, expect } from "vitest";
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";

describe("computeNextRunAt", () => {
  it("advances daily by 1 day", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "DAILY", 1);
    expect(result.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });
  it("advances weekly by 7 days", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "WEEKLY", 1);
    expect(result.toISOString()).toBe("2026-03-08T00:00:00.000Z");
  });
  it("advances monthly by 1 month", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "MONTHLY", 1);
    expect(result.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
  it("advances yearly by 1 year", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "YEARLY", 1);
    expect(result.toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });
  it("respects interval > 1", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "MONTHLY", 3);
    expect(result.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});

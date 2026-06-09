import { describe, it, expect } from "vitest";
import {
  computeHoursBurndown,
  computeMoneyBurndown,
  type HoursRetainerBurndownInput,
  type MoneyRetainerBurndownInput,
} from "@/server/services/retainer-burndown";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function hours(o: Partial<HoursRetainerBurndownInput> = {}): HoursRetainerBurndownInput {
  return {
    retainerId: "r1", retainerName: "Monthly", clientId: "c1", clientName: "Acme",
    periodId: "p1", periodLabel: "Jun 2026",
    periodStart: new Date("2026-06-01T00:00:00.000Z"),
    periodEnd: new Date("2026-06-30T23:59:59.999Z"),
    includedHours: 20, usedHours: 7, ...o,
  };
}
function money(o: Partial<MoneyRetainerBurndownInput> = {}): MoneyRetainerBurndownInput {
  return {
    retainerId: "r2", clientId: "c2", clientName: "Globex",
    balance: 4000, totalDeposits: 10000, totalDrawdowns: 6000,
    windowDrawdowns: 3000, windowDays: 90, ...o,
  };
}

describe("computeHoursBurndown", () => {
  it("computes remaining, pctUsed and a projected depletion date", () => {
    const r = computeHoursBurndown(hours(), NOW);
    expect(r.kind).toBe("hours");
    expect(r.remaining).toBe(13);
    expect(r.pctUsed).toBeCloseTo(0.35, 5);
    expect(r.runRatePerDay).toBeCloseTo(0.5, 5);
    expect(r.projectedDepletionDate).toBe("2026-07-11");
    expect(r.warning).toBe(false);
  });

  it("warns at >= 80% used", () => {
    expect(computeHoursBurndown(hours({ usedHours: 16 }), NOW).warning).toBe(true);
  });

  it("returns null depletion when nothing has been used", () => {
    const r = computeHoursBurndown(hours({ usedHours: 0 }), NOW);
    expect(r.runRatePerDay).toBe(0);
    expect(r.projectedDepletionDate).toBeNull();
  });
});

describe("computeMoneyBurndown", () => {
  it("computes pctUsed from drawdowns/deposits and projects depletion from the window run-rate", () => {
    const r = computeMoneyBurndown(money(), NOW);
    expect(r.kind).toBe("money");
    expect(r.remaining).toBe(4000);
    expect(r.pctUsed).toBeCloseTo(0.6, 5);
    expect(r.runRatePerDay).toBeCloseTo(33.3333, 3);
    expect(r.projectedDepletionDate).toBe("2026-10-13");
    expect(r.warning).toBe(false);
  });

  it("no deposits → pctUsed 0, no depletion, no warning", () => {
    const r = computeMoneyBurndown(money({ totalDeposits: 0, totalDrawdowns: 0, windowDrawdowns: 0, balance: 0 }), NOW);
    expect(r.pctUsed).toBe(0);
    expect(r.projectedDepletionDate).toBeNull();
    expect(r.warning).toBe(false);
  });

  it("warns at >= 80% used", () => {
    expect(computeMoneyBurndown(money({ totalDrawdowns: 8000 }), NOW).warning).toBe(true);
  });
});

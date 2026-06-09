import { describe, it, expect } from "vitest";
import { deriveRunway } from "@/server/services/runway";
import {
  projectCashFlow,
  type CashFlowForecastInput,
} from "@/server/services/cash-flow-forecast";

const NOW = new Date("2026-06-06T00:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

describe("deriveRunway — burn rate", () => {
  it("computes monthly burn as recurring expense minus recurring revenue", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [
        {
          amount: 1000,
          autoCharge: true,
          nextRunAt: daysFromNow(5),
          frequency: "MONTHLY",
          interval: 1,
          endDate: null,
          maxOccurrences: null,
          occurrenceCount: 0,
        },
      ],
      recurringExpenses: [
        { amount: 1500, nextRunAt: daysFromNow(3), frequency: "MONTHLY", interval: 1, endDate: null },
      ],
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const runway = deriveRunway(input, forecast);
    expect(runway.monthlyRecurringRevenue).toBe(1000);
    expect(runway.monthlyRecurringExpense).toBe(1500);
    expect(runway.monthlyBurn).toBe(500); // expense - revenue
  });

  it("normalizes weekly and yearly schedules to a monthly figure", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [],
      recurringExpenses: [
        { amount: 100, nextRunAt: daysFromNow(1), frequency: "WEEKLY", interval: 1, endDate: null },
        { amount: 1200, nextRunAt: daysFromNow(1), frequency: "YEARLY", interval: 1, endDate: null },
      ],
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const runway = deriveRunway(input, forecast);
    // weekly 100 → ~433.33/mo; yearly 1200 → 100/mo.
    expect(runway.monthlyRecurringExpense).toBeCloseTo(533.33, 1);
  });

  it("reports a negative burn (surplus) when revenue exceeds expenses", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [
        {
          amount: 5000,
          autoCharge: true,
          nextRunAt: daysFromNow(5),
          frequency: "MONTHLY",
          interval: 1,
          endDate: null,
          maxOccurrences: null,
          occurrenceCount: 0,
        },
      ],
      recurringExpenses: [
        { amount: 1000, nextRunAt: daysFromNow(3), frequency: "MONTHLY", interval: 1, endDate: null },
      ],
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const runway = deriveRunway(input, forecast);
    expect(runway.monthlyBurn).toBe(-4000);
  });
});

describe("deriveRunway — net positions & runway", () => {
  it("carries the forecast's 30/60/90-day positions", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [],
      recurringExpenses: [
        { amount: 600, nextRunAt: daysFromNow(3), frequency: "MONTHLY", interval: 1, endDate: null },
      ],
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const runway = deriveRunway(input, forecast);
    expect(runway.netPositions.map((p) => p.horizonDays)).toEqual([30, 60, 90]);
  });

  it("leaves days-of-cash null without a starting balance (reframed runway)", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [],
      recurringExpenses: [
        { amount: 600, nextRunAt: daysFromNow(3), frequency: "MONTHLY", interval: 1, endDate: null },
      ],
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const runway = deriveRunway(input, forecast);
    expect(runway.daysOfCash).toBeNull();
  });

  it("computes days-of-cash when a starting balance is provided and cash is burning", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [],
      recurringExpenses: [
        { amount: 3000, nextRunAt: daysFromNow(3), frequency: "MONTHLY", interval: 1, endDate: null },
      ],
      startingCash: 9000,
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const runway = deriveRunway(input, forecast);
    // burn 3000/mo on 9000 → ~90 days.
    expect(runway.daysOfCash).toBeGreaterThan(80);
    expect(runway.daysOfCash).toBeLessThan(100);
  });
});

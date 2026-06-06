import { describe, it, expect } from "vitest";
import {
  projectCashFlow,
  applyLatePaymentScenario,
  collectionProbabilityForAging,
  type CashFlowForecastInput,
} from "@/server/services/cash-flow-forecast";

const NOW = new Date("2026-06-06T00:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

describe("collectionProbabilityForAging", () => {
  it("scales down as an invoice ages", () => {
    expect(collectionProbabilityForAging(-5)).toBe(0.95);
    expect(collectionProbabilityForAging(20)).toBe(0.9);
    expect(collectionProbabilityForAging(45)).toBe(0.75);
    expect(collectionProbabilityForAging(80)).toBe(0.55);
    expect(collectionProbabilityForAging(120)).toBe(0.35);
  });
});

describe("projectCashFlow", () => {
  it("weights an open invoice by its aging probability", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [
        { id: "i1", clientId: "c1", clientName: "Acme", balance: 1000, dueDate: daysFromNow(10) },
      ],
      recurringInvoices: [],
      recurringExpenses: [],
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const h30 = forecast.horizons.find((h) => h.horizonDays === 30)!;
    // Not yet due → 0.95 weighting.
    expect(h30.projectedInflow).toBe(950);
    expect(h30.confidence).toBe(0.95);
  });

  it("projects autopay recurring invoices as near-certain inflow shortly after issue", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [
        {
          amount: 2000,
          autoCharge: true,
          nextRunAt: daysFromNow(5),
          frequency: "MONTHLY",
          interval: 1,
          endDate: null,
          maxOccurrences: null,
          occurrenceCount: 0,
        },
      ],
      recurringExpenses: [],
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const h30 = forecast.horizons.find((h) => h.horizonDays === 30)!;
    expect(h30.projectedInflow).toBe(1940); // 2000 * 0.97
    const h90 = forecast.horizons.find((h) => h.horizonDays === 90)!;
    // Three monthly occurrences land inside 90 days.
    expect(h90.projectedInflow).toBe(round(3 * 2000 * 0.97));
  });

  it("respects maxOccurrences and endDate when rolling recurring schedules forward", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [
        {
          amount: 1000,
          autoCharge: true,
          nextRunAt: daysFromNow(2),
          frequency: "WEEKLY",
          interval: 1,
          endDate: null,
          maxOccurrences: 2,
          occurrenceCount: 0,
        },
      ],
      recurringExpenses: [],
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const autopayEvents = forecast.inflows.filter((e) => e.source === "recurring_autopay");
    expect(autopayEvents).toHaveLength(2);
  });

  it("subtracts recurring expenses from the projected position", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [],
      recurringInvoices: [],
      recurringExpenses: [
        {
          amount: 500,
          nextRunAt: daysFromNow(3),
          frequency: "MONTHLY",
          interval: 1,
          endDate: null,
        },
      ],
      startingCash: 1000,
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const h30 = forecast.horizons.find((h) => h.horizonDays === 30)!;
    expect(h30.projectedOutflow).toBe(500);
    expect(h30.projectedPosition).toBe(500); // 1000 + (0 - 500)
  });

  it("reports projected position relative to starting cash", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [
        { id: "i1", clientId: "c1", clientName: "Acme", balance: 1000, dueDate: daysFromNow(5) },
      ],
      recurringInvoices: [],
      recurringExpenses: [],
      startingCash: 5000,
    };
    const forecast = projectCashFlow(input, { now: NOW });
    const h30 = forecast.horizons.find((h) => h.horizonDays === 30)!;
    expect(h30.projectedPosition).toBe(5950);
  });
});

describe("applyLatePaymentScenario", () => {
  it("pushes a delayed client's collection out of the near horizon", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [
        { id: "i1", clientId: "acme", clientName: "Acme", balance: 1000, dueDate: daysFromNow(10) },
      ],
      recurringInvoices: [],
      recurringExpenses: [],
    };
    const base = projectCashFlow(input, { now: NOW });
    const scenario = applyLatePaymentScenario(
      input,
      [{ clientId: "acme", clientName: "Acme", delayDays: 30 }],
      { now: NOW },
    );
    const baseH30 = base.horizons.find((h) => h.horizonDays === 30)!;
    const scenarioH30 = scenario.horizons.find((h) => h.horizonDays === 30)!;
    // Originally collected within 30 days; after a 30-day delay it falls outside.
    expect(baseH30.projectedInflow).toBe(950);
    expect(scenarioH30.projectedInflow).toBe(0);
    // But it still lands inside the 60-day horizon.
    const scenarioH60 = scenario.horizons.find((h) => h.horizonDays === 60)!;
    expect(scenarioH60.projectedInflow).toBe(950);
  });

  it("leaves untargeted clients unaffected", () => {
    const input: CashFlowForecastInput = {
      openInvoices: [
        { id: "i1", clientId: "acme", clientName: "Acme", balance: 1000, dueDate: daysFromNow(10) },
        { id: "i2", clientId: "globex", clientName: "Globex", balance: 2000, dueDate: daysFromNow(10) },
      ],
      recurringInvoices: [],
      recurringExpenses: [],
    };
    const scenario = applyLatePaymentScenario(
      input,
      [{ clientId: "acme", clientName: "Acme", delayDays: 40 }],
      { now: NOW },
    );
    const h30 = scenario.horizons.find((h) => h.horizonDays === 30)!;
    // Only Globex (2000 * 0.95 = 1900) remains in the 30-day window.
    expect(h30.projectedInflow).toBe(1900);
  });
});

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

import { describe, it, expect } from "vitest";
import {
  buildEstimatedTaxSummary,
  usEstimatedTaxQuarters,
  selfEmploymentTax,
  estimatedTaxReminderDue,
  SE_TAX_RATE,
  SE_TAXABLE_FRACTION,
  type DatedAmount,
} from "@/server/services/estimated-tax";

describe("usEstimatedTaxQuarters", () => {
  it("returns the four IRS periods with Q4 due Jan 15 of the next year", () => {
    const q = usEstimatedTaxQuarters(2026);
    expect(q).toHaveLength(4);
    expect(q[0].dueDate.toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(q[1].dueDate.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(q[2].dueDate.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(q[3].dueDate.toISOString()).toBe("2027-01-15T00:00:00.000Z");
    // Q1 covers Jan 1 – Mar 31
    expect(q[0].periodStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(q[0].periodEnd.toISOString()).toBe("2026-03-31T23:59:59.999Z");
  });
});

describe("selfEmploymentTax", () => {
  it("applies 15.3% to 92.35% of net income", () => {
    expect(selfEmploymentTax(10_000)).toBeCloseTo(10_000 * SE_TAXABLE_FRACTION * SE_TAX_RATE, 6);
  });
  it("is zero for non-positive net income", () => {
    expect(selfEmploymentTax(0)).toBe(0);
    expect(selfEmploymentTax(-5_000)).toBe(0);
  });
});

describe("buildEstimatedTaxSummary", () => {
  const income: DatedAmount[] = [
    { date: new Date("2026-02-10T00:00:00Z"), amount: 10_000 }, // Q1
    { date: new Date("2026-05-10T00:00:00Z"), amount: 6_000 }, // Q2
    { date: new Date("2026-12-20T00:00:00Z"), amount: 4_000 }, // Q4
  ];
  const deductibleExpenses: DatedAmount[] = [
    { date: new Date("2026-02-15T00:00:00Z"), amount: 2_000 }, // Q1
  ];
  const mileageDeductions: DatedAmount[] = [
    { date: new Date("2026-03-01T00:00:00Z"), amount: 500 }, // Q1
  ];

  it("buckets income/expenses/mileage into the right quarters", () => {
    const s = buildEstimatedTaxSummary({
      year: 2026,
      setAsidePercent: 30,
      income,
      deductibleExpenses,
      mileageDeductions,
      now: new Date("2026-01-01T00:00:00Z"),
    });
    // Q1 net = 10000 - 2000 - 500 = 7500
    expect(s.quarters[0].netIncome).toBe(7_500);
    expect(s.quarters[0].recommendedSetAside).toBeCloseTo(7_500 * 0.3, 6);
    // Q2 net = 6000
    expect(s.quarters[1].netIncome).toBe(6_000);
    // Q3 empty
    expect(s.quarters[2].netIncome).toBe(0);
    // Q4 net = 4000
    expect(s.quarters[3].netIncome).toBe(4_000);
  });

  it("rolls YTD totals and set-aside from net income", () => {
    const s = buildEstimatedTaxSummary({
      year: 2026,
      setAsidePercent: 30,
      income,
      deductibleExpenses,
      mileageDeductions,
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(s.ytd.grossIncome).toBe(20_000);
    expect(s.ytd.deductibleExpenses).toBe(2_000);
    expect(s.ytd.mileageDeduction).toBe(500);
    expect(s.ytd.netIncome).toBe(17_500);
    expect(s.ytd.recommendedSetAside).toBeCloseTo(17_500 * 0.3, 6);
  });

  it("floors a negative-net quarter's set-aside at zero", () => {
    const s = buildEstimatedTaxSummary({
      year: 2026,
      setAsidePercent: 30,
      income: [{ date: new Date("2026-02-10T00:00:00Z"), amount: 1_000 }],
      deductibleExpenses: [{ date: new Date("2026-02-15T00:00:00Z"), amount: 5_000 }],
      mileageDeductions: [],
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(s.quarters[0].netIncome).toBe(-4_000);
    expect(s.quarters[0].recommendedSetAside).toBe(0);
    expect(s.quarters[0].seTaxEstimate).toBe(0);
  });

  it("picks the next unpaid due date relative to now", () => {
    const s = buildEstimatedTaxSummary({
      year: 2026,
      setAsidePercent: 30,
      income,
      deductibleExpenses,
      mileageDeductions,
      now: new Date("2026-05-01T00:00:00Z"), // before Jun 15
    });
    expect(s.nextDue?.quarter).toBe(2);
    expect(s.nextDue?.dueDate.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(s.nextDue?.daysUntil).toBe(45);
  });

  it("returns null nextDue once the final deadline has passed", () => {
    const s = buildEstimatedTaxSummary({
      year: 2026,
      setAsidePercent: 30,
      income,
      deductibleExpenses,
      mileageDeductions,
      now: new Date("2027-02-01T00:00:00Z"), // after Jan 15 2027
    });
    expect(s.nextDue).toBeNull();
  });

  it("excludes amounts dated outside any quarter window", () => {
    const s = buildEstimatedTaxSummary({
      year: 2026,
      setAsidePercent: 30,
      income: [{ date: new Date("2025-12-31T00:00:00Z"), amount: 9_999 }],
      deductibleExpenses: [],
      mileageDeductions: [],
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(s.ytd.grossIncome).toBe(0);
  });
});

describe("estimatedTaxReminderDue", () => {
  const dueDates = usEstimatedTaxQuarters(2026).map((q) => q.dueDate);

  it("fires when entering the window and not yet sent", () => {
    const r = estimatedTaxReminderDue({
      now: new Date("2026-06-09T00:00:00Z"), // 6 days before Jun 15
      dueDates,
      reminderDays: 7,
      lastSentAt: null,
    });
    expect(r?.dueDate.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("does not fire before the window opens", () => {
    expect(
      estimatedTaxReminderDue({
        now: new Date("2026-06-01T00:00:00Z"), // >7 days before
        dueDates,
        reminderDays: 7,
        lastSentAt: null,
      }),
    ).toBeNull();
  });

  it("does not re-fire once already sent inside the same window", () => {
    expect(
      estimatedTaxReminderDue({
        now: new Date("2026-06-12T00:00:00Z"),
        dueDates,
        reminderDays: 7,
        lastSentAt: new Date("2026-06-09T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("fires again for the next quarter's window even if last sent recently", () => {
    const r = estimatedTaxReminderDue({
      now: new Date("2026-09-09T00:00:00Z"), // entering Sep 15 window
      dueDates,
      reminderDays: 7,
      lastSentAt: new Date("2026-06-09T00:00:00Z"), // sent for the Jun window
    });
    expect(r?.dueDate.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });
});

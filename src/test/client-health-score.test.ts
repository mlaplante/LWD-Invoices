import { describe, it, expect } from "vitest";
import {
  calculateClientHealthScore,
  calculateClientHealthScores,
  type ClientHealthInput,
} from "@/server/services/client-health-score";

function baseInput(overrides: Partial<ClientHealthInput> = {}): ClientHealthInput {
  return {
    clientId: "c1",
    clientName: "Acme",
    paidInvoiceCount: 10,
    onTimeInvoiceCount: 10,
    averageDaysLate: 0,
    overdueOpenCount: 0,
    overdueOpenAmount: 0,
    emailsSent: 10,
    emailsOpened: 9,
    emailsClicked: 6,
    recentRevenue: 12000,
    priorRevenue: 10000,
    daysSinceLastActivity: 10,
    ...overrides,
  };
}

describe("calculateClientHealthScore", () => {
  it("scores a model client as healthy", () => {
    const result = calculateClientHealthScore(baseInput());
    expect(result.band).toBe("healthy");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.lowData).toBe(false);
    expect(result.churnRiskPercent).toBeLessThan(25);
  });

  it("flags low data when there are too few paid invoices and uses neutral payment score", () => {
    const result = calculateClientHealthScore(
      baseInput({ paidInvoiceCount: 1, onTimeInvoiceCount: 1 }),
    );
    expect(result.lowData).toBe(true);
    expect(result.components.payment.score).toBe(60);
  });

  it("drives a chronically-late, overdue client to critical", () => {
    const result = calculateClientHealthScore(
      baseInput({
        onTimeInvoiceCount: 1,
        averageDaysLate: 30,
        overdueOpenCount: 3,
        overdueOpenAmount: 9000,
        emailsOpened: 1,
        emailsClicked: 0,
        recentRevenue: 1000,
        priorRevenue: 8000,
      }),
    );
    expect(result.band).toBe("critical");
    expect(result.score).toBeLessThan(35);
    expect(result.churnRiskPercent).toBeGreaterThan(50);
    expect(result.signals).toContain("Overdue pressure is high — prioritize collections follow-up.");
  });

  it("penalizes average lateness even at 100% eventual on-time share", () => {
    const onTime = calculateClientHealthScore(baseInput({ averageDaysLate: 0 }));
    const late = calculateClientHealthScore(baseInput({ averageDaysLate: 10 }));
    expect(late.components.payment.score).toBeLessThan(onTime.components.payment.score);
  });

  it("treats new revenue with no prior baseline as a strong positive", () => {
    const result = calculateClientHealthScore(baseInput({ recentRevenue: 5000, priorRevenue: 0 }));
    expect(result.components.revenueTrend.score).toBe(85);
  });

  it("centers revenue-trend score at 50 for flat revenue", () => {
    const result = calculateClientHealthScore(baseInput({ recentRevenue: 10000, priorRevenue: 10000 }));
    expect(result.components.revenueTrend.score).toBe(50);
  });

  it("raises churn risk when the client has gone quiet", () => {
    const active = calculateClientHealthScore(baseInput({ daysSinceLastActivity: 10 }));
    const quiet = calculateClientHealthScore(baseInput({ daysSinceLastActivity: 200 }));
    expect(quiet.churnRiskPercent).toBeGreaterThan(active.churnRiskPercent);
    expect(quiet.signals.some((s) => s.includes("retention check-in"))).toBe(true);
  });

  it("surfaces an upsell signal for a reliable, growing, engaged client", () => {
    const result = calculateClientHealthScore(baseInput({ recentRevenue: 15000, priorRevenue: 10000 }));
    expect(result.signals).toContain("Reliable payer — strong candidate for a retainer or net-terms upsell.");
    expect(result.signals).toContain("Revenue is growing — good moment to propose expanded scope.");
  });

  it("never produces a score outside 0-100", () => {
    const worst = calculateClientHealthScore(
      baseInput({
        onTimeInvoiceCount: 0,
        averageDaysLate: 90,
        overdueOpenCount: 10,
        overdueOpenAmount: 1_000_000,
        emailsOpened: 0,
        emailsClicked: 0,
        recentRevenue: 0,
        priorRevenue: 50000,
      }),
    );
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
  });
});

describe("calculateClientHealthScores", () => {
  it("sorts ascending by score so the most at-risk clients surface first", () => {
    const results = calculateClientHealthScores([
      baseInput({ clientId: "healthy", clientName: "Healthy" }),
      baseInput({
        clientId: "risk",
        clientName: "Risk",
        onTimeInvoiceCount: 2,
        averageDaysLate: 25,
        overdueOpenCount: 4,
        overdueOpenAmount: 20000,
        recentRevenue: 500,
        priorRevenue: 9000,
      }),
    ]);
    expect(results[0].clientId).toBe("risk");
    expect(results[1].clientId).toBe("healthy");
  });
});

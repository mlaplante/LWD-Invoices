import { describe, it, expect } from "vitest";
import { rankCollectionsQueue, type CollectionRiskScore } from "@/server/services/collection-risk";

function score(overrides: Partial<CollectionRiskScore>): CollectionRiskScore {
  return {
    invoiceId: "i",
    invoiceNumber: "INV",
    clientId: "c",
    clientName: "Client",
    balance: 100,
    daysOverdue: 0,
    lateRiskPercent: 0,
    paymentProbabilityPercent: 100,
    paymentProbabilityBand: "high",
    band: "low",
    recommendedAction: "monitor",
    recommendedTone: "helpful",
    actionDue: false,
    daysSinceLastReminder: null,
    reasons: [],
    ...overrides,
  };
}

describe("rankCollectionsQueue", () => {
  it("puts action-due invoices ahead of monitor-only ones", () => {
    const ranked = rankCollectionsQueue([
      score({ invoiceId: "monitor", actionDue: false, lateRiskPercent: 90, balance: 9999 }),
      score({ invoiceId: "due", actionDue: true, lateRiskPercent: 10, balance: 10 }),
    ]);
    expect(ranked[0].invoiceId).toBe("due");
  });

  it("orders action-due invoices by risk-weighted exposure (lateRisk% × balance)", () => {
    const ranked = rankCollectionsQueue([
      score({ invoiceId: "small", actionDue: true, lateRiskPercent: 80, balance: 100 }), // 8000
      score({ invoiceId: "big", actionDue: true, lateRiskPercent: 50, balance: 1000 }), // 50000
    ]);
    expect(ranked.map((r) => r.invoiceId)).toEqual(["big", "small"]);
  });

  it("is deterministic and stable for equal exposure (tie-breaks by invoiceId)", () => {
    const a = score({ invoiceId: "a", actionDue: true, lateRiskPercent: 50, balance: 100 });
    const b = score({ invoiceId: "b", actionDue: true, lateRiskPercent: 50, balance: 100 });
    expect(rankCollectionsQueue([b, a]).map((r) => r.invoiceId)).toEqual(["a", "b"]);
  });
});

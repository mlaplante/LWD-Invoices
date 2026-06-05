import { describe, expect, it, vi } from "vitest";
import {
  buildCashFlowNarrativePrompt,
  calculateCashFlowInsightMetrics,
  generateCashFlowNarrative,
} from "@/server/services/cash-flow-insights";

describe("cash-flow insights", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("calculates month and quarter cash-flow comparisons deterministically", () => {
    const metrics = calculateCashFlowInsightMetrics(
      {
        payments: [
          { amount: 8_800, paidAt: new Date("2026-06-05"), invoice: { clientId: "c1", client: { name: "Acme" }, date: new Date("2026-06-01"), dueDate: new Date("2026-06-30") } },
          { amount: 1_200, paidAt: new Date("2026-05-20"), invoice: { clientId: "c2", client: { name: "Beta" }, date: new Date("2026-05-01"), dueDate: new Date("2026-05-30") } },
          { amount: 10_000, paidAt: new Date("2026-03-10"), invoice: { clientId: "c1", client: { name: "Acme" }, date: new Date("2026-03-01"), dueDate: new Date("2026-03-30") } },
        ],
        expenses: [
          { rate: 100, qty: 3, createdAt: new Date("2026-06-08") },
          { rate: 200, qty: 2, createdAt: new Date("2026-05-10") },
          { rate: 250, qty: 4, createdAt: new Date("2026-03-12") },
        ],
        openInvoices: [],
        retainerTimeEntries: [],
      },
      now,
    );

    expect(metrics.currentMonth.cashIn).toBe(8800);
    expect(metrics.currentMonth.cashOut).toBe(300);
    expect(metrics.currentQuarter.cashIn).toBe(10000);
    expect(metrics.previousQuarter.cashIn).toBe(10000);
    expect(metrics.currentMonth.cashInChangePercent).toBeCloseTo(633.33, 2);
  });

  it("detects overdue balances and reliable-payer unbilled retainer opportunities", () => {
    const metrics = calculateCashFlowInsightMetrics(
      {
        payments: [
          { amount: 1000, paidAt: new Date("2026-06-01"), invoice: { clientId: "c1", client: { name: "Acme" }, date: new Date("2026-05-01"), dueDate: new Date("2026-06-01") } },
          { amount: 900, paidAt: new Date("2026-05-01"), invoice: { clientId: "c1", client: { name: "Acme" }, date: new Date("2026-04-01"), dueDate: new Date("2026-05-01") } },
          { amount: 1100, paidAt: new Date("2026-04-02"), invoice: { clientId: "c1", client: { name: "Acme" }, date: new Date("2026-03-01"), dueDate: new Date("2026-04-01") } },
        ],
        expenses: [],
        openInvoices: [
          { id: "i1", total: 5000, dueDate: new Date("2026-06-01"), status: "OVERDUE", payments: [{ amount: 1250 }], client: { id: "c3", name: "Late Co" } },
        ],
        retainerTimeEntries: [
          { minutes: 90, invoiceLineId: null, retainerId: "r1", retainer: { name: "Support", clientId: "c1", hourlyRate: 150, client: { name: "Acme" } } },
          { minutes: 30, invoiceLineId: null, retainerId: "r1", retainer: { name: "Support", clientId: "c1", hourlyRate: 150, client: { name: "Acme" } } },
        ],
      },
      now,
    );

    expect(metrics.overdue.total).toBe(3750);
    expect(metrics.reliablePayers).toEqual([
      expect.objectContaining({ clientId: "c1", clientName: "Acme", paymentsCount: 3 }),
    ]);
    expect(metrics.unbilledRetainerOpportunities).toEqual([
      expect.objectContaining({ clientId: "c1", clientName: "Acme", hours: 2, estimatedValue: 300 }),
    ]);
  });

  it("returns insufficient-data guardrails instead of pretending to find trends", () => {
    const metrics = calculateCashFlowInsightMetrics(
      { payments: [], expenses: [], openInvoices: [], retainerTimeEntries: [] },
      now,
    );

    expect(metrics.insufficientData).toBe(true);
    expect(metrics.cards[0]).toMatchObject({ severity: "info", title: "Not enough cash-flow history yet" });
  });

  it("shapes an AI prompt with aggregate metrics and no raw invoice/client names", () => {
    const metrics = calculateCashFlowInsightMetrics(
      {
        payments: [
          { amount: 1000, paidAt: new Date("2026-06-01"), invoice: { clientId: "c1", client: { name: "Sensitive Client LLC" }, date: new Date("2026-05-01"), dueDate: new Date("2026-06-01") } },
        ],
        expenses: [],
        openInvoices: [],
        retainerTimeEntries: [],
      },
      now,
    );

    const prompt = buildCashFlowNarrativePrompt(metrics);

    expect(prompt).toContain("cashIn");
    expect(prompt).not.toContain("Sensitive Client LLC");
    expect(prompt).toContain("Do not invent data");
  });

  function narrativeReadyMetrics() {
    return calculateCashFlowInsightMetrics(
      {
        payments: [
          { amount: 1000, paidAt: new Date("2026-06-01"), invoice: { clientId: "c1", client: { name: "Acme" }, date: new Date("2026-05-01"), dueDate: new Date("2026-06-01") } },
          { amount: 900, paidAt: new Date("2026-05-01"), invoice: { clientId: "c1", client: { name: "Acme" }, date: new Date("2026-04-01"), dueDate: new Date("2026-05-01") } },
        ],
        expenses: [],
        openInvoices: [],
        retainerTimeEntries: [],
      },
      now,
    );
  }

  it("uses a mocked OpenAI-compatible fetch for narrative generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: "Cash is up; follow up on overdue invoices." }),
    });

    const narrative = await generateCashFlowNarrative(narrativeReadyMetrics(), {
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
    expect(narrative.source).toBe("openai");
    expect(narrative.summary).toBe("Cash is up; follow up on overdue invoices.");
  });

  it("does not call OpenAI when no API key is configured", async () => {
    const fetchMock = vi.fn();

    const narrative = await generateCashFlowNarrative(narrativeReadyMetrics(), {
      apiKey: "",
      fetchImpl: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(narrative.source).toBe("deterministic");
    expect(narrative.summary).toContain("Estimates are based on payment timing");
  });

  it("falls back to the deterministic narrative when OpenAI fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const narrative = await generateCashFlowNarrative(narrativeReadyMetrics(), {
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(narrative.source).toBe("deterministic");
    expect(narrative.summary).toContain("Estimates are based on payment timing");
  });
});

import { describe, it, expect } from "vitest";
import { InvoiceStatus, InvoiceType, RefundStatus, DisputeStatus } from "@/generated/prisma";
import {
  reconcileBooks,
  draftAdjustingEntries,
  summarizeClose,
  closeHeadline,
  monthRange,
  lastClosedMonth,
  type CloseInvoice,
  type ReconcileInput,
  type CloseAnomalies,
} from "@/server/services/month-end-close";
import { detectExpenseAnomalies, type AnomalyExpense } from "@/server/services/expense-anomaly";

function inv(o: Partial<CloseInvoice> = {}): CloseInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    number: "INV-1",
    clientName: "Acme",
    status: InvoiceStatus.PAID,
    type: InvoiceType.DETAILED,
    total: 1000,
    paid: 1000,
    ...o,
  };
}

function recon(o: Partial<ReconcileInput> = {}): ReconcileInput {
  return { invoices: [], refunds: [], disputes: [], expenses: [], ...o };
}

const NO_ANOMALIES: CloseAnomalies = { duplicates: [], outliers: [] };

describe("monthRange / lastClosedMonth", () => {
  it("computes UTC month boundaries and a human label", () => {
    const { start, end, label } = monthRange(2026, 5);
    expect(start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(label).toBe("May 2026");
  });

  it("returns the previous month, rolling over the year in January", () => {
    expect(lastClosedMonth(new Date("2026-06-06T12:00:00Z"))).toEqual({ year: 2026, month: 5 });
    expect(lastClosedMonth(new Date("2026-01-15T12:00:00Z"))).toEqual({ year: 2025, month: 12 });
  });
});

describe("reconcileBooks", () => {
  it("returns a single ok item when nothing is wrong", () => {
    const items = reconcileBooks(recon({ invoices: [inv()] }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ check: "clean", severity: "ok" });
  });

  it("flags a PAID invoice with no payment as a blocking error", () => {
    const items = reconcileBooks(recon({ invoices: [inv({ number: "INV-9", paid: 0 })] }));
    const item = items.find((i) => i.check === "marked_paid_underfunded");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("error");
    expect(item!.refs).toContain("INV-9");
    expect(item!.amount).toBe(1000);
  });

  it("flags overpayment as a warning with the excess amount", () => {
    const items = reconcileBooks(recon({ invoices: [inv({ total: 1000, paid: 1250 })] }));
    const item = items.find((i) => i.check === "overpaid");
    expect(item?.severity).toBe("warning");
    expect(item?.amount).toBe(250);
  });

  it("flags a fully covered but still-open invoice", () => {
    const items = reconcileBooks(
      recon({ invoices: [inv({ status: InvoiceStatus.SENT, total: 800, paid: 800 })] }),
    );
    expect(items.some((i) => i.check === "covered_not_marked_paid")).toBe(true);
  });

  it("does not hold estimates or drafts to payment integrity", () => {
    const items = reconcileBooks(
      recon({
        invoices: [
          inv({ type: InvoiceType.ESTIMATE, status: InvoiceStatus.ACCEPTED, paid: 0 }),
          inv({ status: InvoiceStatus.DRAFT, paid: 0 }),
        ],
      }),
    );
    expect(items.some((i) => i.check === "marked_paid_underfunded")).toBe(false);
  });

  it("flags lost disputes as errors and open disputes as warnings", () => {
    const items = reconcileBooks(
      recon({
        disputes: [
          { id: "d1", amount: 500, status: DisputeStatus.LOST, invoiceNumber: "INV-7" },
          { id: "d2", amount: 300, status: DisputeStatus.NEEDS_RESPONSE, invoiceNumber: "INV-8" },
        ],
      }),
    );
    expect(items.find((i) => i.check === "lost_disputes")?.severity).toBe("error");
    expect(items.find((i) => i.check === "open_disputes")?.severity).toBe("warning");
  });

  it("flags pending refunds and uncategorized expenses as warnings", () => {
    const items = reconcileBooks(
      recon({
        refunds: [{ id: "r1", amount: 100, status: RefundStatus.PENDING, invoiceNumber: "INV-1" }],
        expenses: [{ id: "e1", supplierName: "AWS", amount: 200, categoryName: null }],
      }),
    );
    expect(items.find((i) => i.check === "pending_refunds")?.severity).toBe("warning");
    expect(items.find((i) => i.check === "uncategorized_expenses")?.severity).toBe("warning");
  });
});

describe("draftAdjustingEntries", () => {
  function dupAnomalies(amount: number, count: number): CloseAnomalies {
    const date = new Date("2026-05-10T00:00:00Z");
    const expenses: AnomalyExpense[] = Array.from({ length: count }, (_, i) => ({
      id: `dup-${i}`,
      supplierKey: "aws",
      supplierName: "AWS",
      amount,
      date,
    }));
    return { duplicates: detectExpenseAnomalies(expenses).duplicates, outliers: [] };
  }

  it("drafts a reversal for the redundant copies of a duplicate", () => {
    const input = recon();
    const anomalies = dupAnomalies(200, 3);
    const entries = draftAdjustingEntries(input, anomalies, reconcileBooks(input));
    const entry = entries.find((e) => e.kind === "reverse_duplicate_expense");
    expect(entry).toBeDefined();
    // 3 copies → 2 redundant × $200 = $400 reversed.
    expect(entry!.amount).toBe(400);
  });

  it("drafts a write-off for overpayments and a reclass for uncategorized expenses", () => {
    const input = recon({
      invoices: [inv({ total: 1000, paid: 1100 })],
      expenses: [{ id: "e1", supplierName: "AWS", amount: 50, categoryName: null }],
    });
    const recItems = reconcileBooks(input);
    const entries = draftAdjustingEntries(input, NO_ANOMALIES, recItems);
    expect(entries.some((e) => e.kind === "write_off_overpayment")).toBe(true);
    expect(entries.some((e) => e.kind === "reclass_uncategorized")).toBe(true);
  });

  it("drafts a chargeback-loss entry for lost disputes", () => {
    const input = recon({
      disputes: [{ id: "d1", amount: 500, status: DisputeStatus.LOST, invoiceNumber: "INV-7" }],
    });
    const entries = draftAdjustingEntries(input, NO_ANOMALIES, reconcileBooks(input));
    expect(entries.some((e) => e.kind === "reverse_lost_dispute")).toBe(true);
  });
});

describe("summarizeClose", () => {
  it("blocks close when there is a reconciliation error", () => {
    const input = recon({ invoices: [inv({ paid: 0 })] });
    const reconciliation = reconcileBooks(input);
    const adjustments = draftAdjustingEntries(input, NO_ANOMALIES, reconciliation);
    const summary = summarizeClose({ reconciliation, anomalies: NO_ANOMALIES, adjustments });
    expect(summary.errorCount).toBe(1);
    expect(summary.canClose).toBe(false);
  });

  it("allows close with only warnings", () => {
    const input = recon({ invoices: [inv({ total: 1000, paid: 1200 })] });
    const reconciliation = reconcileBooks(input);
    const adjustments = draftAdjustingEntries(input, NO_ANOMALIES, reconciliation);
    const summary = summarizeClose({ reconciliation, anomalies: NO_ANOMALIES, adjustments });
    expect(summary.errorCount).toBe(0);
    expect(summary.warningCount).toBeGreaterThan(0);
    expect(summary.canClose).toBe(true);
  });
});

describe("closeHeadline", () => {
  it("states the period totals and the summary headline", () => {
    const headline = closeHeadline({
      period: { year: 2026, month: 5, label: "May 2026", start: "", end: "" },
      generatedAt: "",
      currencySymbol: "$",
      periodElapsed: true,
      totals: { invoiced: 1000, collected: 900, refunded: 0, expenses: 200, netCash: 700 },
      reconciliation: [],
      anomalies: NO_ANOMALIES,
      adjustments: [],
      summary: {
        errorCount: 0,
        warningCount: 0,
        duplicateCount: 0,
        outlierCount: 0,
        adjustmentCount: 0,
        duplicateExposure: 0,
        canClose: true,
        headline: "Books are clean — ready to close.",
      },
    });
    expect(headline).toContain("May 2026");
    expect(headline).toContain("$1,000.00");
    expect(headline).toContain("ready to close");
  });
});

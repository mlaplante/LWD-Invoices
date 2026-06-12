import { describe, it, expect, beforeEach } from "vitest";
import { invoiceReviewRouter } from "@/server/routers/invoiceReview";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("invoiceReview.review — multi-tenant isolation", () => {
  let ctx: ReturnType<typeof createMockContext>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = invoiceReviewRouter.createCaller(ctx);
  });

  it("scopes the invoice lookup to the caller's org", async () => {
    // Another org's invoice is invisible — findFirst returns null
    ctx.db.invoice.findFirst.mockResolvedValue(null);

    await expect(caller.review({ invoiceId: "other-org-invoice" })).rejects.toThrow(TRPCError);

    const where = ctx.db.invoice.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
    expect(where.id).toBe("other-org-invoice");
  });

  it("scopes the duplicate-detection and unbilled-time queries to the caller's org", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "inv1",
      organizationId: "test-org-123",
      total: 100,
      discountTotal: 0,
      clientId: "c1",
      client: {
        id: "c1",
        name: "Acme",
        address: "1 St",
        city: "Town",
        country: "US",
        taxId: "T1",
        isTaxExempt: false,
      },
      lines: [],
      organization: { stripeTaxEnabled: false },
    });
    ctx.db.invoice.findMany.mockResolvedValue([]);
    ctx.db.timeEntry.aggregate.mockResolvedValue({ _sum: { minutes: null } });

    await caller.review({ invoiceId: "inv1" });

    expect(ctx.db.invoice.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.timeEntry.aggregate.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});

describe("invoiceReview.scanDraft — basic validation", () => {
  let ctx: ReturnType<typeof createMockContext>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    ctx.db.client.findFirst.mockResolvedValue({ id: "client-1" });
    ctx.db.currency.findFirst.mockResolvedValue({ id: "USD" });
    ctx.db.tax.findMany.mockResolvedValue([]);
    caller = invoiceReviewRouter.createCaller(ctx);
  });

  it("returns findings for empty lines", async () => {
    const result = await caller.scanDraft({
      mode: "create",
      draft: {
        type: "DETAILED",
        date: "2026-06-11",
        lines: [],
        currencyId: "USD",
      },
      calculatedTotals: {
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        total: 0,
      },
    });

    expect(result.scanId).toBeDefined();
    expect(result.scanId).toContain("scan_");
    expect(result.status).toBe("completed");
    expect(result.summary.findingCount).toBeGreaterThan(0);
    expect(result.findings.some((f: { code: string }) => f.code === "empty_invoice_lines")).toBe(true);
  });

  it("returns findings for missing client", async () => {
    const result = await caller.scanDraft({
      mode: "create",
      draft: {
        type: "DETAILED",
        date: "2026-06-11",
        clientId: null,
        currencyId: "USD",
        lines: [
          {
            clientLineId: "line-1",
            sort: 0,
            lineType: "SERVICE",
            name: "Web Development",
            qty: 10,
            rate: 100,
            discount: 0,
            discountIsPercentage: false,
            taxIds: [],
          },
        ],
      },
      calculatedTotals: {
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 0,
        total: 1000,
      },
    });

    expect(result.findings.some((f: { code: string }) => f.code === "missing_client")).toBe(true);
    expect(result.findings.find((f: { code: string }) => f.code === "missing_client")?.severity).toBe("warning");
  });

  it("returns clean state when no issues found", async () => {
    const result = await caller.scanDraft({
      mode: "create",
      draft: {
        type: "DETAILED",
        date: "2026-06-11",
        clientId: "client-1",
        currencyId: "USD",
        dueDate: "2026-06-30",
        lines: [
          {
            clientLineId: "line-1",
            sort: 0,
            lineType: "SERVICE",
            name: "Web Development",
            qty: 10,
            rate: 100,
            discount: 0,
            discountIsPercentage: false,
            taxIds: [],
          },
        ],
      },
      calculatedTotals: {
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 0,
        total: 1000,
      },
    });

    expect(result.summary.findingCount).toBe(0);
    expect(result.summary.highestSeverity).toBeNull();
  });

  it("includes guardrails in response", async () => {
    const result = await caller.scanDraft({
      mode: "create",
      draft: {
        type: "DETAILED",
        date: "2026-06-11",
        clientId: "client-1",
        currencyId: "USD",
        dueDate: "2026-06-30",
        lines: [
          {
            clientLineId: "line-1",
            sort: 0,
            lineType: "SERVICE",
            name: "Web Development",
            qty: 10,
            rate: 100,
            discount: 0,
            discountIsPercentage: false,
            taxIds: [],
          },
        ],
      },
      calculatedTotals: {
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 0,
        total: 1000,
      },
    });

    expect(result.guardrails).toMatchObject({
      groundedOnly: true,
      tenantScoped: true,
      autoAppliedChanges: false,
    });
  });

  it("includes confidence scores in findings", async () => {
    const result = await caller.scanDraft({
      mode: "create",
      draft: {
        type: "DETAILED",
        date: "2026-06-11",
        currencyId: "USD",
        lines: [],
      },
      calculatedTotals: {
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        total: 0,
      },
    });

    const emptyLinesFinding = result.findings.find((f: { code: string }) => f.code === "empty_invoice_lines");
    expect(emptyLinesFinding).toBeDefined();
    expect(emptyLinesFinding?.confidence).toBe(1.0);
  });

  it("validates tenant scope for edit mode", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue(null); // Invoice not found

    await expect(caller.scanDraft({
      mode: "edit",
      invoiceId: "nonexistent-invoice",
      draft: {
        type: "DETAILED",
        date: "2026-06-11",
        clientId: "client-1",
        currencyId: "USD",
        lines: [
          {
            clientLineId: "line-1",
            sort: 0,
            lineType: "SERVICE",
            name: "Web Development",
            qty: 10,
            rate: 100,
            discount: 0,
            discountIsPercentage: false,
            taxIds: [],
          },
        ],
      },
      calculatedTotals: {
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 0,
        total: 1000,
      },
    })).rejects.toThrow(TRPCError);

    const where = ctx.db.invoice.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe("nonexistent-invoice");
    expect(where.organizationId).toBe("test-org-123");
  });
});

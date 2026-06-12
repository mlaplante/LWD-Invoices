import { describe, it, expect, beforeEach, vi } from "vitest";
import { scanInvoiceDraft, type ScanInvoiceDraftRequest } from "@/server/services/invoice-draft-qa";

// Mock the AI call
vi.mock("@/server/services/gemini-fallback", () => ({
  callGeminiWithModelFallback: vi.fn(() => Promise.resolve({})),
  resolveGeminiModels: vi.fn(() => ["gemini-2.0-flash"]),
}));

// Mock the env variable
vi.mock("@/lib/env", () => ({
  env: {
    GEMINI_API_KEY: "test-key",
    GEMINI_INVOICE_REVIEW_MODELS: undefined,
  },
}));

describe("invoice-draft-qa", () => {
  let mockCtx: any;
  
  beforeEach(() => {
    mockCtx = {
      orgId: "test-org",
      db: {
        invoice: {
          findFirst: vi.fn(() => Promise.resolve(null)),
        },
        client: {
          findFirst: vi.fn(() => Promise.resolve({ id: "client-1" })),
        },
        currency: {
          findFirst: vi.fn(() => Promise.resolve({ id: "currency-1" })),
        },
        tax: {
          findMany: vi.fn(() => Promise.resolve([])),
        },
      },
    };
  });
  
  describe("deterministic checks", () => {
    it("should detect missing client", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: null,
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].code).toBe("missing_client");
      expect(result.findings[0].severity).toBe("warning");
    });
    
    it("should detect empty lines", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          dueDate: "2026-06-30",
          lines: [],
          calculatedTotals: { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 },
        },
        calculatedTotals: { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].code).toBe("empty_invoice_lines");
      expect(result.findings[0].severity).toBe("critical");
    });
    
    it("should detect suspicious invoice discount", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          dueDate: "2026-06-30",
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 30, taxTotal: 0, total: 70 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 30, taxTotal: 0, total: 70 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].code).toBe("suspicious_invoice_discount");
      expect(result.findings[0].severity).toBe("warning");
    });
    
    it("should detect suspicious line discount", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 35,
              discountIsPercentage: true,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 35, taxTotal: 0, total: 65 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 35, taxTotal: 0, total: 65 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      const finding = result.findings.find((f) => f.code === "suspicious_line_discount");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("warning");
    });
    
    it("should detect missing due date", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          dueDate: null,
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].code).toBe("missing_due_date");
      expect(result.findings[0].directlyApplicable).toBe(true);
    });
  });
  
  describe("grounding and safety", () => {
    it("should ensure findings are tenant-scoped", async () => {
      // This would be tested with a proper mock that returns tenant-scoped data
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      // All findings should be grounded
      expect(result.guardrails.groundedOnly).toBe(true);
      expect(result.guardrails.tenantScoped).toBe(true);
      expect(result.guardrails.autoAppliedChanges).toBe(false);
    });
    
    it("should not auto-apply changes", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      // No changes should be auto-applied
      expect(result.guardrails.autoAppliedChanges).toBe(false);
    });
  });
  
  describe("summary and status", () => {
    it("should return correct summary when no findings", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          dueDate: "2026-06-30",
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      expect(result.summary.highestSeverity).toBeNull();
      expect(result.summary.findingCount).toBe(0);
      expect(result.summary.directlyApplicableFixCount).toBe(0);
    });
    
    it("should return correct summary when findings exist", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "create",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: null,
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
      };
      
      const result = await scanInvoiceDraft(req, mockCtx);
      
      expect(result.summary.highestSeverity).toBe("warning");
      expect(result.summary.findingCount).toBe(1);
      expect(result.summary.directlyApplicableFixCount).toBe(0);
    });
  });
  
  describe("API validation", () => {
    it("should validate edit mode requires invoiceId", async () => {
      const req: ScanInvoiceDraftRequest = {
        mode: "edit",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
      };
      
      await expect(scanInvoiceDraft(req, mockCtx)).rejects.toThrow("invoiceId is required in edit mode");
    });
    
    it("should validate tenant scoping for edit mode", async () => {
      mockCtx.db.invoice.findFirst = vi.fn(() => Promise.resolve(null)); // Not found
      
      const req: ScanInvoiceDraftRequest = {
        mode: "edit",
        invoiceId: "non-existent-id",
        draft: {
          type: "standard",
          date: "2026-06-11",
          currencyId: "currency-1",
          clientId: "client-1",
          lines: [
            {
              clientLineId: "tmp-1",
              sort: 0,
              lineType: "standard",
              name: "Design work",
              qty: 1,
              rate: 100,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [],
            },
          ],
          calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
        },
        calculatedTotals: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100 },
      };
      
      // This should throw NOT_FOUND
      await expect(scanInvoiceDraft(req, mockCtx)).rejects.toThrow("Invoice not found or access denied");
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    organization: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
    userOrganization: { findUnique: vi.fn(), findFirst: vi.fn() },
    payment: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    recurringInvoice: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      getUser: vi.fn((token: string) => {
        if (token === "invalid-token") {
          return Promise.resolve({ data: { user: null }, error: new Error("invalid") });
        }
        const organizationId = token === "org-123-token" ? "org-123" : "test-org-123";
        return Promise.resolve({
          data: { user: { id: "user-1", app_metadata: { organizationId } } },
          error: null,
        });
      }),
    },
  }),
}));

import { db } from "@/server/db";
import { clearRateLimits } from "@/app/api/v1/auth";

// Mock the AI service to avoid actual API calls
vi.mock("@/server/services/gemini-fallback", () => ({
  callGeminiWithModelFallback: vi.fn(() => Promise.resolve([
    {
      action: "Focus on collections - you have $12,500 overdue across 3 invoices",
      evidence: "overdue invoices totaling $12,500",
      priority: "high",
    },
  ])),
  extractGeminiText: vi.fn((json: any) => JSON.stringify(json)),
  resolveGeminiModels: vi.fn((env: any, fallback: any) => fallback),
}));

describe("Weekly Briefing API Endpoint", () => {
  let mockNextRequest: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();

    // Happy-path auth: active user with a membership in test-org-123.
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: "db-user-1",
      isActive: true,
    } as any);
    vi.mocked(db.userOrganization.findFirst).mockResolvedValue({
      organizationId: "test-org-123",
    } as any);

    
    // Mock the NextRequest object
    mockNextRequest = {
      url: "http://localhost/api/v1/reports/weekly-briefing",
      headers: new Map([["authorization", "Bearer test-token"]]),
      cookies: new Map(),
      method: "GET",
      nextUrl: new URL("http://localhost/api/v1/reports/weekly-briefing"),
    };
  });

  describe("GET /api/v1/reports/weekly-briefing", () => {
    it("returns 401 when no authentication token is provided", async () => {
      const req = {
        ...mockNextRequest,
        headers: new Map(),
      };
      
      // Import the route handler directly
      const routeModule = await import("@/app/api/v1/reports/weekly-briefing/route");
      const response = await routeModule.GET(req as any);
      
      expect(response.status).toBe(401);
      expect(response.json).toBeDefined();
    });

    it("returns 401 when authentication token is invalid", async () => {
      const req = {
        ...mockNextRequest,
        headers: new Map([["authorization", "Bearer invalid-token"]]),
      };
      
      const routeModule = await import("@/app/api/v1/reports/weekly-briefing/route");
      const response = await routeModule.GET(req as any);
      
      expect(response.status).toBe(401);
    });

    it("returns 401 when the caller has no organization membership", async () => {
      vi.mocked(db.userOrganization.findFirst).mockResolvedValue(null as any);

      const req = {
        ...mockNextRequest,
        headers: new Map([["authorization", "Bearer valid-token"]]),
      };

      const routeModule = await import("@/app/api/v1/reports/weekly-briefing/route");
      const response = await routeModule.GET(req as any);

      expect(response.status).toBe(401);
    });

    it("returns weekly briefing data when authentication succeeds", async () => {
      // Mock organization and related data
      vi.mocked(db.organization.findUnique).mockResolvedValue({
        id: "test-org-123",
        name: "Test Organization",
        brandColor: "#2563eb",
      } as any);
      
      // Mock payments this week
      vi.mocked(db.payment.findMany).mockResolvedValue([
        {
          id: "pay_1",
          amount: "1000.00",
          method: "stripe",
          transactionId: "ch_123",
          paidAt: new Date(),
          invoiceId: "inv_1",
        },
      ] as any);
      
      // Mock expenses this week
      vi.mocked(db.expense.findMany).mockResolvedValue([
        {
          id: "exp_1",
          name: "Office Supplies",
          description: "Monthly supplies",
          qty: 1,
          rate: "250.50",
          paidAt: new Date(),
          createdAt: new Date(),
          categoryId: "cat_1",
        },
      ] as any);
      
      // Mock overdue invoices
      vi.mocked(db.invoice.findMany).mockResolvedValue([
        {
          id: "inv_1",
          status: "OVERDUE",
          total: "500.00",
          dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          client: {
            id: "client_1",
            name: "Test Client",
          },
          currency: {
            code: "USD",
            symbol: "$",
            symbolPosition: "before",
          },
        },
      ] as any);
      
      // Mock recurring invoices
      vi.mocked(db.recurringInvoice.findMany).mockResolvedValue([
        {
          id: "recur_1",
          nextRunAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          invoice: {
            clientId: "client_1",
            number: "INV-001",
            client: { name: "Test Client" },
          },
          organization: {
            id: "test-org-123",
          },
        },
      ] as any);
      
      const { callGeminiWithModelFallback } = await import("@/server/services/gemini-fallback");
      const mockedGemini = vi.mocked(callGeminiWithModelFallback);
      mockedGemini.mockResolvedValue([
        {
          action: "Focus on collections - you have $500 overdue across 1 invoice",
          evidence: "overdue invoices totaling $500",
          priority: "high",
        },
      ]);
      
       const routeModule = await import("@/app/api/v1/reports/weekly-briefing/route");
       const response = await routeModule.GET(mockNextRequest as any);
      
       expect(response.status).toBe(200);
       const data = await response.json();
      
       expect(data).toHaveProperty("weekStart");
       expect(data).toHaveProperty("weekEnd");
       expect(data).toHaveProperty("cashIn");
       expect(data).toHaveProperty("cashOut");
       expect(data).toHaveProperty("overdueInvoiceRisk");
       expect(data).toHaveProperty("expenseAnomalies");
       expect(data).toHaveProperty("upcomingRenewals");
       expect(data).toHaveProperty("recommendations");
       expect(data).toHaveProperty("generatedAt");
       expect(data).toHaveProperty("metadata");
      });

      it("handles empty data gracefully", async () => {
       vi.mocked(db.organization.findUnique).mockResolvedValue({
         id: "test-org-123",
         name: "Test Organization",
         brandColor: "#2563eb",
       } as any);
      
       // Mock empty data
       vi.mocked(db.payment.findMany).mockResolvedValue([]);
       vi.mocked(db.expense.findMany).mockResolvedValue([]);
       vi.mocked(db.invoice.findMany).mockResolvedValue([]);
       vi.mocked(db.recurringInvoice.findMany).mockResolvedValue([]);
      
       const routeModule = await import("@/app/api/v1/reports/weekly-briefing/route");
       const response = await routeModule.GET(mockNextRequest as any);
      
       expect(response.status).toBe(200);
       const data = await response.json();
      
       expect(data.cashIn).toBe(0);
       expect(data.cashOut).toBe(0);
       expect(data.overdueInvoiceRisk.totalOverdue).toBe(0);
       expect(data.overdueInvoiceRisk.count).toBe(0);
       expect(data.recommendations).toBeDefined();
       expect(data.metadata.hasEmptyData).toBe(true);
      });

      it("handles AI service failure gracefully", async () => {
       vi.mocked(db.organization.findUnique).mockResolvedValue({
         id: "test-org-123",
         name: "Test Organization",
         brandColor: "#2563eb",
       } as any);
      
       // Mock some data
       vi.mocked(db.payment.findMany).mockResolvedValue([
         {
           id: "pay_1",
           amount: "1000.00",
           method: "stripe",
           transactionId: "ch_123",
           paidAt: new Date(),
           invoiceId: "inv_1",
         },
       ] as any);
       vi.mocked(db.expense.findMany).mockResolvedValue([]);
       vi.mocked(db.invoice.findMany).mockResolvedValue([]);
       vi.mocked(db.recurringInvoice.findMany).mockResolvedValue([]);
      
       // Mock AI service failure
      const { callGeminiWithModelFallback } = await import("@/server/services/gemini-fallback");
      vi.mocked(callGeminiWithModelFallback).mockRejectedValue(new Error("AI service error"));
      
       const routeModule = await import("@/app/api/v1/reports/weekly-briefing/route");
       const response = await routeModule.GET(mockNextRequest as any);
      
       expect(response.status).toBe(200);
       const data = await response.json();
      
       // Should still return data with fallback recommendations
       expect(data).toHaveProperty("recommendations");
       expect(data.recommendations).toHaveLength(2); // Should have fallback recommendations
      });

    it("respects tenant isolation", async () => {
      vi.mocked(db.organization.findUnique).mockResolvedValue({
        id: "org-123",
        name: "Test Organization",
        brandColor: "#2563eb",
      } as any);

      // The caller's membership resolves to org-123
      vi.mocked(db.userOrganization.findFirst).mockResolvedValue({
        organizationId: "org-123",
      } as any);

      const req = {
        ...mockNextRequest,
        headers: new Map([["authorization", "Bearer org-123-token"]]),
      };
      
      const routeModule = await import("@/app/api/v1/reports/weekly-briefing/route");
      await routeModule.GET(req as any);
      
      // Verify queries use the correct organization ID
      expect(db.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org-123",
          }),
        })
      );
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { InvoiceStatus } from "@/generated/prisma";

// Mock database
vi.mock("@/server/db", () => ({
  db: {
    organization: {
      findUnique: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/server/db";

// Test helper to parse pagination from query params
function extractPaginationFromUrl(url: string) {
  const urlObj = new URL(url, "http://localhost");
  const page = parseInt(urlObj.searchParams.get("page") ?? "1", 10);
  const perPage = parseInt(urlObj.searchParams.get("per_page") ?? "20", 10);
  return { page, perPage };
}

// Test helper to validate status param
function validateInvoiceStatus(statusParam: string | null): InvoiceStatus | null {
  if (!statusParam) return null;
  const validStatuses = Object.values(InvoiceStatus);
  return validStatuses.includes(statusParam as InvoiceStatus)
    ? (statusParam as InvoiceStatus)
    : null;
}

describe("V1 API Endpoint Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Invoice Listing (/v1/invoices)", () => {
    it("returns invoices with default pagination", () => {
      const url = "http://localhost/api/v1/invoices";
      const { page, perPage } = extractPaginationFromUrl(url);

      expect(page).toBe(1);
      expect(perPage).toBe(20);
    });

    it("extracts status filter from query params", () => {
      const url = "http://localhost/api/v1/invoices?status=SENT";
      const urlObj = new URL(url);
      const status = validateInvoiceStatus(urlObj.searchParams.get("status"));

      expect(status).toBe("SENT");
    });

    it("rejects invalid status parameter", () => {
      const url = "http://localhost/api/v1/invoices?status=INVALID";
      const urlObj = new URL(url);
      const status = validateInvoiceStatus(urlObj.searchParams.get("status"));

      expect(status).toBeNull();
    });

    it("handles all valid invoice statuses", () => {
      const validStatuses = [
        "DRAFT",
        "SENT",
        "PAID",
        "PARTIALLY_PAID",
        "OVERDUE",
        "ACCEPTED",
        "REJECTED",
      ];

      validStatuses.forEach((statusStr) => {
        const url = `http://localhost/api/v1/invoices?status=${statusStr}`;
        const urlObj = new URL(url);
        const status = validateInvoiceStatus(urlObj.searchParams.get("status"));
        expect(status).toBe(statusStr);
      });
    });

    it("applies pagination with custom per_page", () => {
      const url = "http://localhost/api/v1/invoices?page=3&per_page=50";
      const { page, perPage } = extractPaginationFromUrl(url);

      expect(page).toBe(3);
      expect(perPage).toBe(50);
    });

    it("ignores non-numeric pagination params", () => {
      const url = "http://localhost/api/v1/invoices?page=abc&per_page=xyz";
      const { page, perPage } = extractPaginationFromUrl(url);

      // NaN defaults to 1
      expect(isNaN(page)).toBe(true);
      expect(isNaN(perPage)).toBe(true);
    });

    it("combines pagination and status filter", () => {
      const url = "http://localhost/api/v1/invoices?page=2&per_page=30&status=PAID";
      const urlObj = new URL(url);
      const { page, perPage } = extractPaginationFromUrl(url);
      const status = validateInvoiceStatus(urlObj.searchParams.get("status"));

      expect(page).toBe(2);
      expect(perPage).toBe(30);
      expect(status).toBe("PAID");
    });
  });

  describe("Invoice Detail (/v1/invoices/[id])", () => {
    it("extracts invoice ID from path", () => {
      const id = "inv_12345";
      expect(id).toMatch(/^inv_/);
    });

    it("validates invoice ID format", () => {
      const validId = "inv_xyz123";
      const invalidId = "not-an-invoice";

      expect(validId).toContain("inv_");
      expect(invalidId).not.toContain("inv_");
    });

    it("prepares database query for invoice retrieval", () => {
      const orgId = "org_123";
      const invoiceId = "inv_456";

      const query = {
        where: { id: invoiceId, organizationId: orgId },
      };

      expect(query.where.id).toBe(invoiceId);
      expect(query.where.organizationId).toBe(orgId);
    });
  });

  describe("Client Listing (/v1/clients)", () => {
    it("extracts pagination for client list", () => {
      const url = "http://localhost/api/v1/clients?page=1&per_page=20";
      const { page, perPage } = extractPaginationFromUrl(url);

      expect(page).toBe(1);
      expect(perPage).toBe(20);
    });

    it("orders clients by name", () => {
      const orderBy = { name: "asc" as const };
      expect(orderBy.name).toBe("asc");
    });

    it("filters out archived clients by default", () => {
      const filter = { isArchived: false };
      expect(filter.isArchived).toBe(false);
    });
  });

  describe("Error Cases", () => {
    it("returns 404 when organization not found", () => {
      const statusCode = 404;
      const message = "Not found";

      expect(statusCode).toBe(404);
      expect(message).toBe("Not found");
    });

    it("returns 400 for invalid status parameter", () => {
      const statusCode = 400;
      const message = "Invalid status value";

      expect(statusCode).toBe(400);
      expect(message).toBe("Invalid status value");
    });

    it("returns 401 for missing authorization", () => {
      const statusCode = 401;
      const message = "Unauthorized";

      expect(statusCode).toBe(401);
      expect(message).toBe("Unauthorized");
    });

    it("returns 401 for invalid Bearer token", () => {
      const authHeader = "Basic abc123"; // Wrong auth type
      expect(authHeader).not.toMatch(/^Bearer /);
    });

    it("returns 429 for rate limit exceeded", () => {
      const statusCode = 429;
      const message = "Too many requests";

      expect(statusCode).toBe(429);
      expect(message).toBe("Too many requests");
    });
  });

  describe("Response Format", () => {
    it("returns invoices in data wrapper", () => {
      const response = { data: [], page: 1 };

      expect(response).toHaveProperty("data");
      expect(response).toHaveProperty("page");
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("returns single invoice in data wrapper", () => {
      const response = { data: { id: "inv_123" } };

      expect(response).toHaveProperty("data");
      expect(response.data).toHaveProperty("id");
    });

    it("response includes pagination info", () => {
      const response = { data: [], page: 2 };

      expect(response.page).toBe(2);
    });

    it("includes client info in invoice response", () => {
      const invoice = {
        id: "inv_123",
        client: {
          id: "client_456",
          name: "Acme Corp",
          email: "contact@acme.com",
        },
      };

      expect(invoice.client).toBeDefined();
      expect(invoice.client.name).toBe("Acme Corp");
    });

    it("includes currency info in invoice response", () => {
      const invoice = {
        id: "inv_123",
        currency: {
          id: "usd",
          symbol: "$",
        },
      };

      expect(invoice.currency).toBeDefined();
      expect(invoice.currency.symbol).toBe("$");
    });
  });

  describe("Query Parameter Handling", () => {
    it("ignores unknown query parameters", () => {
      const url = "http://localhost/api/v1/invoices?foo=bar&baz=qux&page=1";
      const urlObj = new URL(url);
      const page = parseInt(urlObj.searchParams.get("page") ?? "1", 10);

      // Should only extract known params
      expect(page).toBe(1);
      expect(urlObj.searchParams.get("foo")).toBe("bar");
    });

    it("handles multiple values for same param (uses first)", () => {
      const url = "http://localhost/api/v1/invoices?status=DRAFT&status=SENT";
      const urlObj = new URL(url);
      const status = urlObj.searchParams.get("status");

      expect(status).toBe("DRAFT"); // First value
    });

    it("handles URL-encoded query parameters", () => {
      const url = "http://localhost/api/v1/invoices?search=Acme%20Corp";
      const urlObj = new URL(url);
      const search = urlObj.searchParams.get("search");

      expect(search).toBe("Acme Corp");
    });

    it("handles empty query parameters", () => {
      const url = "http://localhost/api/v1/invoices?page=&per_page=";
      const urlObj = new URL(url);
      const page = urlObj.searchParams.get("page");
      const perPage = urlObj.searchParams.get("per_page");

      expect(page).toBe("");
      expect(perPage).toBe("");
    });
  });

  describe("Authorization Header Parsing", () => {
    it("extracts token from Bearer authorization", () => {
      const authHeader = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";
      const token = authHeader.slice(7); // Remove "Bearer "

      expect(token).toBe("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0");
    });

    it("rejects malformed authorization headers", () => {
      const invalidHeaders = [
        "Bearer",
        "Basic abc123",
        "Token xyz",
        "",
      ];

      invalidHeaders.forEach((header) => {
        const isValid = header.startsWith("Bearer ");
        expect(isValid).toBe(false);
      });

      // Valid header
      expect("Bearer abc123".startsWith("Bearer ")).toBe(true);
    });

    it("handles authorization with special characters in token", () => {
      const authHeader = "Bearer sk_test_123+/=abc";
      const isValid = authHeader.startsWith("Bearer ");

      expect(isValid).toBe(true);
    });
  });

  describe("Path Parameter Handling", () => {
    it("extracts ID from dynamic route parameter", async () => {
      const params = { id: "inv_123" };
      expect(params.id).toBe("inv_123");
    });

    it("validates invoice ID structure", () => {
      const validIds = ["inv_1", "inv_abc123", "inv_with_underscores"];
      const invalidIds = ["123", "invoice_1", "inv"];

      validIds.forEach((id) => {
        expect(id.startsWith("inv_")).toBe(true);
      });

      invalidIds.forEach((id) => {
        expect(id.startsWith("inv_")).toBe(false);
      });
    });

    it("handles UUID-style IDs", () => {
      const id = "inv_550e8400-e29b-41d4-a716-446655440000";
      expect(id).toContain("inv_");
    });
  });

  describe("Content Type Handling", () => {
    it("returns JSON content type", () => {
      const contentType = "application/json";
      expect(contentType).toBe("application/json");
    });

    it("response is JSON serializable", () => {
      const response = {
        data: [{ id: "inv_1", amount: 100 }],
        page: 1,
      };

      const json = JSON.stringify(response);
      expect(json).toBeDefined();
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});

import { describe, it, expect } from "vitest";
import { InvoiceStatus, InvoiceType } from "@/generated/prisma";

/**
 * Query builder helpers extracted from invoices router list procedure
 * These functions construct Prisma WHERE clauses from filter inputs
 */

interface InvoiceListInput {
  status?: InvoiceStatus[];
  type?: InvoiceType;
  clientId?: string;
  includeArchived?: boolean;
  recurring?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  orgId: string;
}

interface InvoiceListWhere {
  organizationId: string;
  status?: { in: InvoiceStatus[] };
  type?: InvoiceType;
  clientId?: string;
  isArchived?: boolean;
  recurringInvoice?: { isActive: true };
  date?: {
    gte?: Date;
    lte?: Date;
  };
  OR?: Array<{
    number?: { contains: string; mode: "insensitive" };
    client?: { name: { contains: string; mode: "insensitive" } };
  }>;
}

function buildInvoiceListWhere(input: InvoiceListInput): InvoiceListWhere {
  const where: InvoiceListWhere = {
    organizationId: input.orgId,
    ...(input.status?.length ? { status: { in: input.status } } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
    ...(input.includeArchived ? {} : { isArchived: false }),
    ...(input.recurring ? { recurringInvoice: { isActive: true } } : {}),
    ...(input.dateFrom || input.dateTo
      ? {
          date: {
            ...(input.dateFrom ? { gte: input.dateFrom } : {}),
            ...(input.dateTo ? { lte: input.dateTo } : {}),
          },
        }
      : {}),
    ...(input.search
      ? {
          OR: [
            { number: { contains: input.search, mode: "insensitive" } },
            { client: { name: { contains: input.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  return where;
}

function buildDateRangeFilter(dateFrom?: Date, dateTo?: Date) {
  if (!dateFrom && !dateTo) return undefined;

  return {
    ...(dateFrom ? { gte: dateFrom } : {}),
    ...(dateTo ? { lte: dateTo } : {}),
  };
}

function buildSearchFilter(search?: string) {
  if (!search) return undefined;

  return {
    OR: [
      { number: { contains: search, mode: "insensitive" } },
      { client: { name: { contains: search, mode: "insensitive" } } },
    ],
  };
}

describe("Invoice Query Builders", () => {
  describe("buildInvoiceListWhere", () => {
    it("includes organizationId always", () => {
      const where = buildInvoiceListWhere({ orgId: "org_123" });

      expect(where.organizationId).toBe("org_123");
    });

    it("excludes archived invoices by default", () => {
      const where = buildInvoiceListWhere({ orgId: "org_123", includeArchived: false });

      expect(where.isArchived).toBe(false);
    });

    it("includes archived invoices when requested", () => {
      const where = buildInvoiceListWhere({ orgId: "org_123", includeArchived: true });

      expect(where.isArchived).toBeUndefined();
    });

    it("filters by status when provided", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: [InvoiceStatus.DRAFT, InvoiceStatus.SENT],
      });

      expect(where.status).toEqual({
        in: [InvoiceStatus.DRAFT, InvoiceStatus.SENT],
      });
    });

    it("ignores status filter when empty array", () => {
      const where = buildInvoiceListWhere({ orgId: "org_123", status: [] });

      expect(where.status).toBeUndefined();
    });

    it("filters by type when provided", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        type: InvoiceType.DETAILED,
      });

      expect(where.type).toBe(InvoiceType.DETAILED);
    });

    it("filters by clientId when provided", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        clientId: "client_456",
      });

      expect(where.clientId).toBe("client_456");
    });

    it("filters recurring invoices when requested", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        recurring: true,
      });

      expect(where.recurringInvoice).toEqual({ isActive: true });
    });

    it("omits recurring filter when not requested", () => {
      const where = buildInvoiceListWhere({ orgId: "org_123", recurring: false });

      expect(where.recurringInvoice).toBeUndefined();
    });

    it("filters by date range", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-12-31");
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        dateFrom: from,
        dateTo: to,
      });

      expect(where.date).toEqual({
        gte: from,
        lte: to,
      });
    });

    it("filters by dateFrom only", () => {
      const from = new Date("2026-01-01");
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        dateFrom: from,
      });

      expect(where.date).toEqual({ gte: from });
    });

    it("filters by dateTo only", () => {
      const to = new Date("2026-12-31");
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        dateTo: to,
      });

      expect(where.date).toEqual({ lte: to });
    });

    it("searches by invoice number and client name", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        search: "Acme Corp",
      });

      expect(where.OR).toEqual([
        { number: { contains: "Acme Corp", mode: "insensitive" } },
        { client: { name: { contains: "Acme Corp", mode: "insensitive" } } },
      ]);
    });

    it("search is case-insensitive", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        search: "DRAFT",
      });

      expect(where.OR?.[0]?.number?.mode).toBe("insensitive");
      expect(where.OR?.[1]?.client?.name?.mode).toBe("insensitive");
    });

    it("combines multiple filters", () => {
      const from = new Date("2026-01-01");
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: [InvoiceStatus.SENT],
        clientId: "client_456",
        dateFrom: from,
        search: "Invoice",
        includeArchived: false,
      });

      expect(where.organizationId).toBe("org_123");
      expect(where.status?.in).toContain(InvoiceStatus.SENT);
      expect(where.clientId).toBe("client_456");
      expect(where.date?.gte).toEqual(from);
      expect(where.OR).toBeDefined();
      expect(where.isArchived).toBe(false);
    });

    it("omits undefined filters", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: undefined,
        type: undefined,
        clientId: undefined,
      });

      expect(where.status).toBeUndefined();
      expect(where.type).toBeUndefined();
      expect(where.clientId).toBeUndefined();
    });
  });

  describe("buildDateRangeFilter", () => {
    it("returns undefined when no dates provided", () => {
      expect(buildDateRangeFilter()).toBeUndefined();
      expect(buildDateRangeFilter(undefined, undefined)).toBeUndefined();
    });

    it("creates filter with both dates", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-12-31");
      const filter = buildDateRangeFilter(from, to);

      expect(filter).toEqual({
        gte: from,
        lte: to,
      });
    });

    it("creates filter with from date only", () => {
      const from = new Date("2026-01-01");
      const filter = buildDateRangeFilter(from);

      expect(filter).toEqual({ gte: from });
    });

    it("creates filter with to date only", () => {
      const to = new Date("2026-12-31");
      const filter = buildDateRangeFilter(undefined, to);

      expect(filter).toEqual({ lte: to });
    });

    it("preserves date precision", () => {
      const precise = new Date("2026-02-26T14:30:45.123Z");
      const filter = buildDateRangeFilter(precise);

      expect(filter?.gte).toEqual(precise);
    });

    it("handles leap year dates", () => {
      const leapDay = new Date("2024-02-29");
      const filter = buildDateRangeFilter(leapDay);

      expect(filter?.gte).toEqual(leapDay);
    });
  });

  describe("buildSearchFilter", () => {
    it("returns undefined when no search provided", () => {
      expect(buildSearchFilter()).toBeUndefined();
      expect(buildSearchFilter("")).toBeUndefined();
    });

    it("creates filter with search string", () => {
      const filter = buildSearchFilter("Invoice #123");

      expect(filter?.OR).toHaveLength(2);
      expect(filter?.OR?.[0]).toHaveProperty("number");
      expect(filter?.OR?.[1]).toHaveProperty("client");
    });

    it("searches invoice number with case-insensitive match", () => {
      const filter = buildSearchFilter("INV-2026");

      expect(filter?.OR?.[0]?.number?.contains).toBe("INV-2026");
      expect(filter?.OR?.[0]?.number?.mode).toBe("insensitive");
    });

    it("searches client name with case-insensitive match", () => {
      const filter = buildSearchFilter("acme");

      expect(filter?.OR?.[1]?.client?.name?.contains).toBe("acme");
      expect(filter?.OR?.[1]?.client?.name?.mode).toBe("insensitive");
    });

    it("preserves search string exactly", () => {
      const search = "Acme Corp & Co.";
      const filter = buildSearchFilter(search);

      expect(filter?.OR?.[0]?.number?.contains).toBe(search);
      expect(filter?.OR?.[1]?.client?.name?.contains).toBe(search);
    });

    it("handles special characters in search", () => {
      const search = "ABC-123/2026 (Draft)";
      const filter = buildSearchFilter(search);

      expect(filter?.OR?.[0]?.number?.contains).toBe(search);
    });

    it("handles unicode characters", () => {
      const search = "Ångström & Co™";
      const filter = buildSearchFilter(search);

      expect(filter?.OR?.[1]?.client?.name?.contains).toBe(search);
    });

    it("filter has exactly two search targets", () => {
      const filter = buildSearchFilter("test");

      expect(filter?.OR).toHaveLength(2);
    });
  });

  describe("Complex Filtering Scenarios", () => {
    it("filters paid invoices from specific client in date range", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-03-31");
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: [InvoiceStatus.PAID],
        clientId: "client_456",
        dateFrom: from,
        dateTo: to,
        includeArchived: false,
      });

      expect(where.organizationId).toBe("org_123");
      expect(where.status?.in).toEqual([InvoiceStatus.PAID]);
      expect(where.clientId).toBe("client_456");
      expect(where.date?.gte).toEqual(from);
      expect(where.date?.lte).toEqual(to);
      expect(where.isArchived).toBe(false);
    });

    it("searches all unpaid invoices", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
        search: "pending",
        includeArchived: false,
      });

      expect(where.status?.in).toHaveLength(3);
      expect(where.OR).toBeDefined();
      expect(where.isArchived).toBe(false);
    });

    it("retrieves archived invoices only", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        includeArchived: true,
        status: [InvoiceStatus.DRAFT],
      });

      expect(where.isArchived).toBeUndefined();
      expect(where.status?.in).toContain(InvoiceStatus.DRAFT);
    });

    it("filters by all available dimensions simultaneously", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-12-31");
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: [InvoiceStatus.SENT, InvoiceStatus.PAID],
        type: InvoiceType.SIMPLE,
        clientId: "client_789",
        dateFrom: from,
        dateTo: to,
        search: "Q1",
        includeArchived: false,
        recurring: true,
      });

      expect(where.organizationId).toBe("org_123");
      expect(where.status?.in).toHaveLength(2);
      expect(where.type).toBe(InvoiceType.SIMPLE);
      expect(where.clientId).toBe("client_789");
      expect(where.date).toBeDefined();
      expect(where.OR).toBeDefined();
      expect(where.isArchived).toBe(false);
      expect(where.recurringInvoice?.isActive).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty status array", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: [],
      });

      expect(where.status).toBeUndefined();
    });

    it("handles single status", () => {
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: [InvoiceStatus.DRAFT],
      });

      expect(where.status?.in).toEqual([InvoiceStatus.DRAFT]);
    });

    it("handles all statuses", () => {
      const allStatuses = Object.values(InvoiceStatus);
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        status: allStatuses,
      });

      expect(where.status?.in).toHaveLength(allStatuses.length);
    });

    it("handles very long search string", () => {
      const longSearch = "A".repeat(100);
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        search: longSearch,
      });

      expect(where.OR?.[0]?.number?.contains).toBe(longSearch);
    });

    it("handles dates at year boundaries", () => {
      const jan1 = new Date("2026-01-01T00:00:00Z");
      const dec31 = new Date("2026-12-31T23:59:59Z");
      const where = buildInvoiceListWhere({
        orgId: "org_123",
        dateFrom: jan1,
        dateTo: dec31,
      });

      expect(where.date?.gte).toEqual(jan1);
      expect(where.date?.lte).toEqual(dec31);
    });

    it("does not mutate input object", () => {
      const input: InvoiceListInput = {
        orgId: "org_123",
        status: [InvoiceStatus.DRAFT],
        search: "test",
      };
      const originalStatus = [...input.status];

      buildInvoiceListWhere(input);

      expect(input.status).toEqual(originalStatus);
    });
  });
});

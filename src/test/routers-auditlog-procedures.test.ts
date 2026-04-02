import { describe, it, expect, beforeEach, vi } from "vitest";
import { auditLogRouter } from "@/server/routers/auditLog";
import { createMockContext } from "./mocks/trpc-context";

describe("AuditLog Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = auditLogRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns audit logs for organization", async () => {
      const mockAuditLogs = [
        {
          id: "audit_1",
          organizationId: "test-org-123",
          action: "INVOICE_CREATED",
          entityType: "Invoice",
          entityId: "inv_1",
          changes: { status: "DRAFT" },
          userId: "test-user-456",
          createdAt: new Date("2026-02-26T10:00:00Z"),
        },
        {
          id: "audit_2",
          organizationId: "test-org-123",
          action: "INVOICE_SENT",
          entityType: "Invoice",
          entityId: "inv_1",
          changes: { status: "SENT" },
          userId: "test-user-456",
          createdAt: new Date("2026-02-26T11:00:00Z"),
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      const result = await caller.list({});

      expect(result).toHaveLength(2);
      expect(result[0]?.action).toBe("INVOICE_CREATED");
      expect(result[1]?.action).toBe("INVOICE_SENT");
    });

    it("filters by entityType when provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.auditLog.findMany.mockResolvedValue([]);

      await caller.list({ entityType: "Invoice" });

      expect(ctx.db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            entityType: "Invoice",
          }),
        })
      );
    });

    it("filters by entityId when provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.auditLog.findMany.mockResolvedValue([]);

      await caller.list({ entityId: "inv_123" });

      expect(ctx.db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            entityId: "inv_123",
          }),
        })
      );
    });

    it("applies pagination with limit and offset", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.auditLog.findMany.mockResolvedValue([]);

      await caller.list({ limit: 20, offset: 40 });

      expect(ctx.db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 40,
        })
      );
    });

    it("sorts by createdAt descending", async () => {
      const mockAuditLogs = [
        {
          id: "audit_2",
          organizationId: "test-org-123",
          action: "INVOICE_SENT",
          entityType: "Invoice",
          entityId: "inv_1",
          createdAt: new Date("2026-02-26T11:00:00Z"),
        },
        {
          id: "audit_1",
          organizationId: "test-org-123",
          action: "INVOICE_CREATED",
          entityType: "Invoice",
          entityId: "inv_1",
          createdAt: new Date("2026-02-26T10:00:00Z"),
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      await caller.list({});

      expect(ctx.db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        })
      );

      const result = await caller.list({});
      expect(result[0]?.createdAt.getTime()).toBeGreaterThan(
        result[1]?.createdAt.getTime()
      );
    });

    it("respects organization isolation", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.auditLog.findMany.mockResolvedValue([]);

      await caller.list({});

      expect(ctx.db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
          }),
        })
      );
    });

    it("throws NOT_FOUND when organization does not exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(caller.list({})).rejects.toThrow("NOT_FOUND");
    });

    it("combines entityType and entityId filters", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.auditLog.findMany.mockResolvedValue([]);

      await caller.list({ entityType: "Invoice", entityId: "inv_123" });

      expect(ctx.db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            entityType: "Invoice",
            entityId: "inv_123",
          }),
        })
      );
    });
  });
});

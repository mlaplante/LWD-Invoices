import { describe, it, expect, beforeEach, vi } from "vitest";
import { logAudit } from "@/server/services/audit";
import { db } from "@/server/db";
import { AuditAction } from "@/generated/prisma";

vi.mock("@/server/db", () => ({
  db: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

describe("Audit Service", () => {
  describe("logAudit", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("creates audit log with all fields", async () => {
      const mockAuditLog = {
        id: "audit_1",
        action: AuditAction.CREATED,
        entityType: "invoice",
        entityId: "inv_123",
        entityLabel: "INV-2026-0001",
        userId: "user_1",
        userLabel: "John Doe",
        organizationId: "org_123",
        diff: { amount: 1000 },
        createdAt: new Date(),
      };

      (db.auditLog.create as any).mockResolvedValue(mockAuditLog);

      const input = {
        action: AuditAction.CREATED,
        entityType: "invoice",
        entityId: "inv_123",
        entityLabel: "INV-2026-0001",
        userId: "user_1",
        userLabel: "John Doe",
        organizationId: "org_123",
        diff: { amount: 1000 },
      };

      await logAudit(input);

      expect(db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: AuditAction.CREATED,
            entityType: "invoice",
            entityId: "inv_123",
          }),
        })
      );
    });

    it("handles optional fields", async () => {
      (db.auditLog.create as any).mockResolvedValue({});

      await logAudit({
        action: AuditAction.DELETED,
        entityType: "client",
        entityId: "c_1",
        organizationId: "org_123",
      });

      expect(db.auditLog.create).toHaveBeenCalled();
    });

    it("converts diff to InputJsonValue correctly", async () => {
      (db.auditLog.create as any).mockResolvedValue({});

      const diff = { field1: "old_value", field2: { nested: true } };

      await logAudit({
        action: AuditAction.UPDATED,
        entityType: "invoice",
        entityId: "inv_123",
        organizationId: "org_123",
        diff,
      });

      expect(db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            diff: diff as any,
          }),
        })
      );
    });

    it("handles undefined diff", async () => {
      (db.auditLog.create as any).mockResolvedValue({});

      await logAudit({
        action: AuditAction.VIEWED,
        entityType: "report",
        entityId: "r_1",
        organizationId: "org_123",
      });

      expect(db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            diff: undefined,
          }),
        })
      );
    });

    it("logs all AuditAction types", async () => {
      (db.auditLog.create as any).mockResolvedValue({});

      const actions = Object.values(AuditAction);

      for (const action of actions) {
        await logAudit({
          action,
          entityType: "test",
          entityId: "t_1",
          organizationId: "org_123",
        });
      }

      expect(db.auditLog.create).toHaveBeenCalledTimes(actions.length);
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createNotification, notifyOrgAdmins } from "@/server/services/notifications";
import { db } from "@/server/db";
import { NotificationType } from "@/generated/prisma";

vi.mock("@/server/db", () => ({
  db: {
    notification: { create: vi.fn() },
    organization: { findFirst: vi.fn() },
  },
}));

describe("Notifications Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createNotification", () => {
    it("creates notification with all fields", async () => {
      const mockNotification = {
        id: "notif_1",
        type: NotificationType.INVOICE_SENT,
        title: "Invoice Sent",
        body: "Your invoice has been sent",
        link: "/invoices/inv_1",
        userId: "user_1",
        organizationId: "org_123",
      };

      (db.notification.create as any).mockResolvedValue(mockNotification);

      const result = await createNotification({
        type: NotificationType.INVOICE_SENT,
        title: "Invoice Sent",
        body: "Your invoice has been sent",
        link: "/invoices/inv_1",
        userId: "user_1",
        organizationId: "org_123",
      });

      expect(result.id).toBe("notif_1");
      expect(db.notification.create).toHaveBeenCalled();
    });

    it("handles notifications without links", async () => {
      (db.notification.create as any).mockResolvedValue({});

      await createNotification({
        type: NotificationType.PAYMENT_RECEIVED,
        title: "Payment Received",
        body: "You received a payment",
        userId: "user_1",
        organizationId: "org_123",
      });

      expect(db.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ link: expect.anything() }),
        })
      );
    });
  });

  describe("notifyOrgAdmins", () => {
    it("notifies all admin users in organization", async () => {
      const mockOrg = {
        id: "org_123",
        users: [
          { id: "u_1", supabaseId: "sub_1", role: "ADMIN" },
          { id: "u_2", supabaseId: "sub_2", role: "ADMIN" },
        ],
      };

      (db.organization.findFirst as any).mockResolvedValue(mockOrg);
      (db.notification.create as any).mockResolvedValue({});

      await notifyOrgAdmins("org_123", {
        type: NotificationType.INVOICE_OVERDUE,
        title: "Invoice Overdue",
        body: "An invoice is overdue",
      });

      expect(db.notification.create).toHaveBeenCalledTimes(2);
      expect(db.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "sub_1",
            organizationId: "org_123",
          }),
        })
      );
    });

    it("returns early if organization not found", async () => {
      (db.organization.findFirst as any).mockResolvedValue(null);

      await notifyOrgAdmins("nonexistent", {
        type: NotificationType.INVOICE_SENT,
        title: "Test",
        body: "Test",
      });

      expect(db.notification.create).not.toHaveBeenCalled();
    });

    it("uses supabaseId if available, falls back to id", async () => {
      const mockOrg = {
        id: "org_123",
        users: [
          { id: "u_1", supabaseId: "sub_1", role: "ADMIN" }, // Has supabaseId
          { id: "u_2", supabaseId: null, role: "ADMIN" }, // Fallback to id
        ],
      };

      (db.organization.findFirst as any).mockResolvedValue(mockOrg);
      (db.notification.create as any).mockResolvedValue({});

      await notifyOrgAdmins("org_123", {
        type: NotificationType.INVOICE_PAID,
        title: "Paid",
        body: "Invoice paid",
      });

      const calls = (db.notification.create as any).mock.calls;
      expect(calls[0][0].data.userId).toBe("sub_1");
      expect(calls[1][0].data.userId).toBe("u_2");
    });

    it("handles organizations with no admins", async () => {
      const mockOrg = {
        id: "org_123",
        users: [],
      };

      (db.organization.findFirst as any).mockResolvedValue(mockOrg);

      await notifyOrgAdmins("org_123", {
        type: NotificationType.INVOICE_SENT,
        title: "Test",
        body: "Test",
      });

      expect(db.notification.create).not.toHaveBeenCalled();
    });
  });
});

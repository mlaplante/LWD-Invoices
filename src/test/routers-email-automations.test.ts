import { describe, it, expect, beforeEach } from "vitest";
import { emailAutomationsRouter } from "@/server/routers/emailAutomations";
import { createMockContext } from "./mocks/trpc-context";

describe("Email Automations Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    (ctx as any).userRole = "OWNER";
    caller = emailAutomationsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns automations for the org", async () => {
      const mockAutomations = [
        {
          id: "ea_1",
          trigger: "INVOICE_SENT",
          delayDays: 0,
          templateSubject: "Thanks!",
          templateBody: "Your invoice was sent.",
          enabled: true,
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      ctx.db.emailAutomation.findMany.mockResolvedValue(mockAutomations);

      const result = await caller.list();

      expect(result).toHaveLength(1);
      expect(result[0].trigger).toBe("INVOICE_SENT");
      expect(ctx.db.emailAutomation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "test-org-123" },
        }),
      );
    });
  });

  describe("create", () => {
    it("creates with correct data", async () => {
      const input = {
        trigger: "PAYMENT_RECEIVED" as const,
        delayDays: 1,
        templateSubject: "Payment received for {{invoiceNumber}}",
        templateBody: "Dear {{clientName}}, we received your payment.",
        enabled: true,
      };
      const mockCreated = {
        id: "ea_new",
        ...input,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      ctx.db.emailAutomation.create.mockResolvedValue(mockCreated);

      const result = await caller.create(input);

      expect(result.id).toBe("ea_new");
      expect(result.trigger).toBe("PAYMENT_RECEIVED");
      expect(ctx.db.emailAutomation.create).toHaveBeenCalledWith({
        data: {
          ...input,
          organizationId: "test-org-123",
        },
      });
    });
  });

  describe("update", () => {
    it("updates existing automation", async () => {
      ctx.db.emailAutomation.findFirst.mockResolvedValue({
        id: "ea_1",
        organizationId: "test-org-123",
      });
      const updated = {
        id: "ea_1",
        trigger: "INVOICE_SENT",
        delayDays: 3,
        templateSubject: "Updated subject",
        templateBody: "Updated body",
        enabled: true,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      ctx.db.emailAutomation.update.mockResolvedValue(updated);

      const result = await caller.update({ id: "ea_1", delayDays: 3 });

      expect(result.delayDays).toBe(3);
      expect(ctx.db.emailAutomation.update).toHaveBeenCalledWith({
        where: { id: "ea_1" },
        data: { delayDays: 3 },
      });
    });

    it("throws NOT_FOUND for wrong org", async () => {
      ctx.db.emailAutomation.findFirst.mockResolvedValue(null);

      await expect(
        caller.update({ id: "ea_wrong", delayDays: 5 }),
      ).rejects.toThrow("Automation not found");
    });
  });

  describe("delete", () => {
    it("deletes and returns success", async () => {
      ctx.db.emailAutomation.findFirst.mockResolvedValue({
        id: "ea_1",
        organizationId: "test-org-123",
      });
      ctx.db.emailAutomation.delete.mockResolvedValue({});

      const result = await caller.delete({ id: "ea_1" });

      expect(result).toEqual({ success: true });
      expect(ctx.db.emailAutomation.delete).toHaveBeenCalledWith({
        where: { id: "ea_1" },
      });
    });

    it("throws NOT_FOUND for wrong org", async () => {
      ctx.db.emailAutomation.findFirst.mockResolvedValue(null);

      await expect(
        caller.delete({ id: "ea_wrong" }),
      ).rejects.toThrow("Automation not found");
    });
  });

  describe("getLogs", () => {
    it("returns logs for org", async () => {
      const mockLogs = [
        {
          id: "log_1",
          automationId: "ea_1",
          invoiceId: "inv_1",
          recipientEmail: "client@test.com",
          sentAt: new Date(),
        },
      ];
      ctx.db.emailAutomationLog.findMany.mockResolvedValue(mockLogs);

      const result = await caller.getLogs();

      expect(result).toHaveLength(1);
      expect(result[0].recipientEmail).toBe("client@test.com");
    });

    it("filters by automationId when provided", async () => {
      ctx.db.emailAutomationLog.findMany.mockResolvedValue([]);

      await caller.getLogs({ automationId: "ea_1" });

      expect(ctx.db.emailAutomationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            automationId: "ea_1",
          }),
        }),
      );
    });
  });
});

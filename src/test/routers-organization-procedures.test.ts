import { describe, it, expect, beforeEach } from "vitest";
import { organizationRouter } from "@/server/routers/organization";
import { createMockContext } from "./mocks/trpc-context";

describe("Organization Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = organizationRouter.createCaller(ctx);
  });

  describe("get", () => {
    it("returns organization with all settings", async () => {
      ctx.db.organization.findUnique.mockResolvedValue({
        id: "test-org-123",
        name: "Test Organization",
        slug: "test-org",
        logoUrl: "https://example.com/logo.png",
        brandColor: "#FF5733",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        taskTimeInterval: 15,
        defaultPaymentTermsDays: 30,
        paymentReminderDays: [3, 7, 14],
      });

      const result = await caller.get();

      expect(result.id).toBe("test-org-123");
      expect(result.name).toBe("Test Organization");
      expect(result.logoUrl).toBe("https://example.com/logo.png");
      expect(result.brandColor).toBe("#FF5733");
      expect(result.invoicePrefix).toBe("INV");
      expect(result.invoiceNextNumber).toBe(100);
      expect(result.taskTimeInterval).toBe(15);
      expect(result.defaultPaymentTermsDays).toBe(30);
      expect(result.paymentReminderDays).toEqual([3, 7, 14]);
      expect(ctx.db.organization.findUnique).toHaveBeenCalledWith({
        where: { id: "test-org-123" },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          brandColor: true,
          invoicePrefix: true,
          invoiceNextNumber: true,
          taskTimeInterval: true,
          defaultPaymentTermsDays: true,
          paymentReminderDays: true,
        },
      });
    });

    it("throws NOT_FOUND when organization doesn't exist", async () => {
      ctx.db.organization.findUnique.mockResolvedValue(null);

      try {
        await caller.get();
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("update", () => {
    it("updates organization name, logoUrl, and brandColor", async () => {
      ctx.db.organization.update.mockResolvedValue({
        id: "test-org-123",
        name: "Updated Org Name",
        slug: "test-org",
        logoUrl: "https://example.com/new-logo.png",
        brandColor: "#00FF00",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        taskTimeInterval: 15,
        defaultPaymentTermsDays: 30,
        paymentReminderDays: [3, 7, 14],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        name: "Updated Org Name",
        logoUrl: "https://example.com/new-logo.png",
        brandColor: "#00FF00",
      });

      expect(result.name).toBe("Updated Org Name");
      expect(result.logoUrl).toBe("https://example.com/new-logo.png");
      expect(result.brandColor).toBe("#00FF00");
      expect(ctx.db.organization.update).toHaveBeenCalledWith({
        where: { id: "test-org-123" },
        data: {
          name: "Updated Org Name",
          logoUrl: "https://example.com/new-logo.png",
          brandColor: "#00FF00",
        },
      });
    });

    it("validates brandColor with hex format", async () => {
      ctx.db.organization.update.mockResolvedValue({
        id: "test-org-123",
        name: "Test Organization",
        slug: "test-org",
        logoUrl: null,
        brandColor: "#1A2B3C",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        taskTimeInterval: 15,
        defaultPaymentTermsDays: 30,
        paymentReminderDays: [3, 7, 14],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        brandColor: "#1A2B3C",
      });

      expect(result.brandColor).toBe("#1A2B3C");
    });

    it("rejects invalid brandColor formats", async () => {
      try {
        await caller.update({
          brandColor: "invalid-color",
        });
        expect.fail("Should have thrown a validation error");
      } catch (err: any) {
        expect(err.code).toMatch(/BAD_REQUEST|PARSE_ERROR/);
      }
    });

    it("updates defaultPaymentTermsDays", async () => {
      ctx.db.organization.update.mockResolvedValue({
        id: "test-org-123",
        name: "Test Organization",
        slug: "test-org",
        logoUrl: null,
        brandColor: "#FF5733",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        taskTimeInterval: 15,
        defaultPaymentTermsDays: 60,
        paymentReminderDays: [3, 7, 14],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        defaultPaymentTermsDays: 60,
      });

      expect(result.defaultPaymentTermsDays).toBe(60);
      expect(ctx.db.organization.update).toHaveBeenCalledWith({
        where: { id: "test-org-123" },
        data: { defaultPaymentTermsDays: 60 },
      });
    });

    it("updates paymentReminderDays array", async () => {
      ctx.db.organization.update.mockResolvedValue({
        id: "test-org-123",
        name: "Test Organization",
        slug: "test-org",
        logoUrl: null,
        brandColor: "#FF5733",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        taskTimeInterval: 15,
        defaultPaymentTermsDays: 30,
        paymentReminderDays: [1, 5, 10, 15],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        paymentReminderDays: [1, 5, 10, 15],
      });

      expect(result.paymentReminderDays).toEqual([1, 5, 10, 15]);
      expect(ctx.db.organization.update).toHaveBeenCalledWith({
        where: { id: "test-org-123" },
        data: { paymentReminderDays: [1, 5, 10, 15] },
      });
    });

    it("updates with partial fields", async () => {
      ctx.db.organization.update.mockResolvedValue({
        id: "test-org-123",
        name: "Updated Name Only",
        slug: "test-org",
        logoUrl: null,
        brandColor: "#FF5733",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        taskTimeInterval: 15,
        defaultPaymentTermsDays: 30,
        paymentReminderDays: [3, 7, 14],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        name: "Updated Name Only",
      });

      expect(result.name).toBe("Updated Name Only");
      expect(ctx.db.organization.update).toHaveBeenCalledWith({
        where: { id: "test-org-123" },
        data: { name: "Updated Name Only" },
      });
    });

    it("allows clearing logoUrl with null", async () => {
      ctx.db.organization.update.mockResolvedValue({
        id: "test-org-123",
        name: "Test Organization",
        slug: "test-org",
        logoUrl: null,
        brandColor: "#FF5733",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        taskTimeInterval: 15,
        defaultPaymentTermsDays: 30,
        paymentReminderDays: [3, 7, 14],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        logoUrl: null,
      });

      expect(result.logoUrl).toBeNull();
      expect(ctx.db.organization.update).toHaveBeenCalledWith({
        where: { id: "test-org-123" },
        data: { logoUrl: null },
      });
    });
  });
});

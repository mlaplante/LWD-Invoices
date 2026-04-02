import { describe, it, expect, beforeEach, vi } from "vitest";
import { partialPaymentsRouter } from "@/server/routers/partialPayments";
import { createMockContext } from "./mocks/trpc-context";

describe("Partial Payments Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = partialPaymentsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns partial payments for invoice", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      const mockPartialPayments = [
        {
          id: "pp_1",
          invoiceId: "inv_1",
          organizationId: "test-org-123",
          sortOrder: 0,
          amount: 1000,
          isPercentage: false,
          dueDate: new Date("2026-03-01"),
          notes: "First payment",
          isPaid: false,
          paidAt: null,
          paymentMethod: null,
          transactionId: null,
          gatewayFee: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "pp_2",
          invoiceId: "inv_1",
          organizationId: "test-org-123",
          sortOrder: 1,
          amount: 1000,
          isPercentage: false,
          dueDate: new Date("2026-04-01"),
          notes: "Second payment",
          isPaid: false,
          paidAt: null,
          paymentMethod: null,
          transactionId: null,
          gatewayFee: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.partialPayment.findMany.mockResolvedValue(mockPartialPayments);

      const result = await caller.list({ invoiceId: "inv_1" });

      expect(result).toHaveLength(2);
      expect(result[0]?.amount).toBe(1000);
      expect(result[1]?.amount).toBe(1000);
      expect(ctx.db.partialPayment.findMany).toHaveBeenCalledWith({
        where: { invoiceId: "inv_1" },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("orders partial payments by sortOrder ascending", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      const mockPartialPayments = [
        {
          id: "pp_1",
          invoiceId: "inv_1",
          sortOrder: 0,
          amount: 500,
          isPaid: false,
        },
        {
          id: "pp_3",
          invoiceId: "inv_1",
          sortOrder: 2,
          amount: 500,
          isPaid: false,
        },
        {
          id: "pp_2",
          invoiceId: "inv_1",
          sortOrder: 1,
          amount: 500,
          isPaid: false,
        },
      ];

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.partialPayment.findMany.mockResolvedValue(mockPartialPayments);

      await caller.list({ invoiceId: "inv_1" });

      expect(ctx.db.partialPayment.findMany).toHaveBeenCalledWith({
        where: { invoiceId: "inv_1" },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("throws NOT_FOUND when invoice doesn't exist", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(caller.list({ invoiceId: "inv_nonexistent" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });

    it("throws NOT_FOUND when invoice belongs to different organization", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(caller.list({ invoiceId: "inv_1" })).rejects.toThrow("NOT_FOUND");

      expect(ctx.db.invoice.findUnique).toHaveBeenCalledWith({
        where: { id: "inv_1", organizationId: "test-org-123" },
        select: { id: true },
      });
    });

    it("returns empty array when invoice has no partial payments", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.partialPayment.findMany.mockResolvedValue([]);

      const result = await caller.list({ invoiceId: "inv_1" });

      expect(result).toHaveLength(0);
    });
  });

  describe("set", () => {
    it("creates new partial payment schedule", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      const newSchedule = [
        {
          sortOrder: 0,
          amount: 1000,
          isPercentage: false,
          dueDate: new Date("2026-03-01"),
          notes: "First payment",
        },
      ];

      const createdPayments = [
        {
          id: "pp_1",
          invoiceId: "inv_1",
          organizationId: "test-org-123",
          sortOrder: 0,
          amount: 1000,
          isPercentage: false,
          dueDate: new Date("2026-03-01"),
          notes: "First payment",
          isPaid: false,
          paidAt: null,
          paymentMethod: null,
          transactionId: null,
          gatewayFee: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockTx = {
        partialPayment: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue(createdPayments),
        },
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await caller.set({
        invoiceId: "inv_1",
        schedule: newSchedule,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.amount).toBe(1000);
      expect(mockTx.partialPayment.deleteMany).toHaveBeenCalledWith({
        where: { invoiceId: "inv_1", isPaid: false },
      });
    });

    it("replaces unpaid partial payments and preserves paid ones", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      const newSchedule = [
        {
          sortOrder: 0,
          amount: 1500,
          isPercentage: false,
          dueDate: new Date("2026-03-01"),
          notes: "Updated schedule",
        },
      ];

      const mockTx = {
        partialPayment: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "pp_new",
              invoiceId: "inv_1",
              organizationId: "test-org-123",
              sortOrder: 0,
              amount: 1500,
              isPercentage: false,
              dueDate: new Date("2026-03-01"),
              notes: "Updated schedule",
              isPaid: false,
              paidAt: null,
              paymentMethod: null,
              transactionId: null,
              gatewayFee: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await caller.set({
        invoiceId: "inv_1",
        schedule: newSchedule,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.amount).toBe(1500);
      expect(mockTx.partialPayment.deleteMany).toHaveBeenCalledWith({
        where: { invoiceId: "inv_1", isPaid: false },
      });
    });

    it("validates payment amount is positive", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(
        caller.set({
          invoiceId: "inv_1",
          schedule: [
            {
              sortOrder: 0,
              amount: -100,
              isPercentage: false,
            },
          ],
        })
      ).rejects.toThrow();
    });

    it("clears schedule when passed empty array", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      const mockTx = {
        partialPayment: {
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          createMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await caller.set({
        invoiceId: "inv_1",
        schedule: [],
      });

      expect(result).toHaveLength(0);
      expect(mockTx.partialPayment.deleteMany).toHaveBeenCalledWith({
        where: { invoiceId: "inv_1", isPaid: false },
      });
    });

    it("throws NOT_FOUND when invoice doesn't exist", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(
        caller.set({
          invoiceId: "inv_nonexistent",
          schedule: [
            {
              sortOrder: 0,
              amount: 1000,
              isPercentage: false,
            },
          ],
        })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("creates payment with percentage flag", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      const newSchedule = [
        {
          sortOrder: 0,
          amount: 50,
          isPercentage: true,
          dueDate: new Date("2026-03-01"),
          notes: "50% deposit",
        },
      ];

      const mockTx = {
        partialPayment: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "pp_1",
              invoiceId: "inv_1",
              organizationId: "test-org-123",
              sortOrder: 0,
              amount: 50,
              isPercentage: true,
              dueDate: new Date("2026-03-01"),
              notes: "50% deposit",
              isPaid: false,
              paidAt: null,
              paymentMethod: null,
              transactionId: null,
              gatewayFee: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await caller.set({
        invoiceId: "inv_1",
        schedule: newSchedule,
      });

      expect(result[0]?.isPercentage).toBe(true);
      expect(result[0]?.amount).toBe(50);
    });

    it("includes organizationId when creating payments", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
      };

      const newSchedule = [
        {
          sortOrder: 0,
          amount: 1000,
          isPercentage: false,
        },
      ];

      const mockTx = {
        partialPayment: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      await caller.set({
        invoiceId: "inv_1",
        schedule: newSchedule,
      });

      expect(mockTx.partialPayment.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            invoiceId: "inv_1",
            organizationId: "test-org-123",
            amount: 1000,
            isPercentage: false,
          }),
        ]),
      });
    });
  });

  describe("recordPayment", () => {
    it("marks partial payment as paid", async () => {
      const mockPartialPayment = {
        id: "pp_1",
        invoiceId: "inv_1",
        amount: 1000,
        isPaid: false,
        paidAt: null,
        paymentMethod: null,
        transactionId: null,
        gatewayFee: 0,
        invoice: {
          organizationId: "test-org-123",
        },
      };

      const updatedPayment = {
        ...mockPartialPayment,
        isPaid: true,
        paidAt: new Date(),
        paymentMethod: "stripe",
        transactionId: "txn_123",
        gatewayFee: 25,
      };

      ctx.db.partialPayment.findUnique.mockResolvedValue(mockPartialPayment);
      ctx.db.partialPayment.update.mockResolvedValue(updatedPayment);

      const result = await caller.recordPayment({
        id: "pp_1",
        paymentMethod: "stripe",
        transactionId: "txn_123",
        gatewayFee: 25,
      });

      expect(result.isPaid).toBe(true);
      expect(result.paymentMethod).toBe("stripe");
      expect(result.transactionId).toBe("txn_123");
      expect(result.gatewayFee).toBe(25);
      expect(ctx.db.partialPayment.update).toHaveBeenCalledWith({
        where: { id: "pp_1" },
        data: {
          isPaid: true,
          paidAt: expect.any(Date),
          paymentMethod: "stripe",
          transactionId: "txn_123",
          gatewayFee: 25,
        },
      });
    });

    it("throws error when partial payment already paid", async () => {
      const mockPartialPayment = {
        id: "pp_1",
        invoiceId: "inv_1",
        amount: 1000,
        isPaid: true,
        paidAt: new Date("2026-02-20"),
        invoice: {
          organizationId: "test-org-123",
        },
      };

      ctx.db.partialPayment.findUnique.mockResolvedValue(mockPartialPayment);

      await expect(
        caller.recordPayment({
          id: "pp_1",
          paymentMethod: "stripe",
        })
      ).rejects.toThrow("Already paid");
    });

    it("throws NOT_FOUND when partial payment doesn't exist", async () => {
      ctx.db.partialPayment.findUnique.mockResolvedValue(null);

      await expect(
        caller.recordPayment({
          id: "pp_nonexistent",
          paymentMethod: "stripe",
        })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("throws NOT_FOUND when partial payment belongs to different organization", async () => {
      const mockPartialPayment = {
        id: "pp_1",
        invoiceId: "inv_1",
        isPaid: false,
        invoice: {
          organizationId: "other-org-456",
        },
      };

      ctx.db.partialPayment.findUnique.mockResolvedValue(mockPartialPayment);

      await expect(
        caller.recordPayment({
          id: "pp_1",
          paymentMethod: "stripe",
        })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("uses default gatewayFee of 0 when not provided", async () => {
      const mockPartialPayment = {
        id: "pp_1",
        invoiceId: "inv_1",
        amount: 1000,
        isPaid: false,
        paidAt: null,
        paymentMethod: null,
        transactionId: null,
        gatewayFee: 0,
        invoice: {
          organizationId: "test-org-123",
        },
      };

      const updatedPayment = {
        ...mockPartialPayment,
        isPaid: true,
        paidAt: new Date(),
        paymentMethod: "bank_transfer",
        transactionId: null,
        gatewayFee: 0,
      };

      ctx.db.partialPayment.findUnique.mockResolvedValue(mockPartialPayment);
      ctx.db.partialPayment.update.mockResolvedValue(updatedPayment);

      const result = await caller.recordPayment({
        id: "pp_1",
        paymentMethod: "bank_transfer",
      });

      expect(result.gatewayFee).toBe(0);
      expect(ctx.db.partialPayment.update).toHaveBeenCalledWith({
        where: { id: "pp_1" },
        data: {
          isPaid: true,
          paidAt: expect.any(Date),
          paymentMethod: "bank_transfer",
          transactionId: undefined,
          gatewayFee: 0,
        },
      });
    });

    it("records transaction details with payment", async () => {
      const mockPartialPayment = {
        id: "pp_1",
        invoiceId: "inv_1",
        amount: 1000,
        isPaid: false,
        paidAt: null,
        paymentMethod: null,
        transactionId: null,
        gatewayFee: 0,
        invoice: {
          organizationId: "test-org-123",
        },
      };

      const updatedPayment = {
        ...mockPartialPayment,
        isPaid: true,
        paidAt: new Date(),
        paymentMethod: "stripe",
        transactionId: "txn_abc123",
        gatewayFee: 30,
      };

      ctx.db.partialPayment.findUnique.mockResolvedValue(mockPartialPayment);
      ctx.db.partialPayment.update.mockResolvedValue(updatedPayment);

      const result = await caller.recordPayment({
        id: "pp_1",
        paymentMethod: "stripe",
        transactionId: "txn_abc123",
        gatewayFee: 30,
      });

      expect(result.paymentMethod).toBe("stripe");
      expect(result.transactionId).toBe("txn_abc123");
      expect(result.gatewayFee).toBe(30);
    });
  });
});

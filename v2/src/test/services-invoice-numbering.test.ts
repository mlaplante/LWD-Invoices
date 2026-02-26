import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateInvoiceNumber } from "@/server/services/invoice-numbering";

describe("Invoice Numbering Service", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      organization: {
        update: vi.fn(),
      },
    };
  });

  describe("generateInvoiceNumber", () => {
    it("generates invoice number with correct format", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "INV",
        invoiceNextNumber: 1,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`INV-${year}-0001`);
    });

    it("increments invoice number atomically", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "INV",
        invoiceNextNumber: 42,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`INV-${year}-0042`);
      expect(mockDb.organization.update).toHaveBeenCalledWith({
        where: { id: "org_123" },
        data: { invoiceNextNumber: { increment: 1 } },
        select: { invoicePrefix: true, invoiceNextNumber: true },
      });
    });

    it("pads invoice numbers to 4 digits", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`INV-${year}-0100`);
    });

    it("handles large invoice numbers", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "INV",
        invoiceNextNumber: 9999,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`INV-${year}-9999`);
    });

    it("uses organization's custom prefix", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update.mockResolvedValue({
        invoicePrefix: "ACME",
        invoiceNextNumber: 1,
      });

      const number = await generateInvoiceNumber(mockDb, "org_123");

      expect(number).toBe(`ACME-${year}-0001`);
    });

    it("generates sequential numbers", async () => {
      const year = new Date().getFullYear();
      mockDb.organization.update
        .mockResolvedValueOnce({
          invoicePrefix: "INV",
          invoiceNextNumber: 1,
        })
        .mockResolvedValueOnce({
          invoicePrefix: "INV",
          invoiceNextNumber: 2,
        })
        .mockResolvedValueOnce({
          invoicePrefix: "INV",
          invoiceNextNumber: 3,
        });

      const num1 = await generateInvoiceNumber(mockDb, "org_123");
      const num2 = await generateInvoiceNumber(mockDb, "org_123");
      const num3 = await generateInvoiceNumber(mockDb, "org_123");

      expect(num1).toBe(`INV-${year}-0001`);
      expect(num2).toBe(`INV-${year}-0002`);
      expect(num3).toBe(`INV-${year}-0003`);
    });
  });
});

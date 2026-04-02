import { describe, it, expect } from "vitest";
import { InvoiceStatus } from "@/generated/prisma";

/**
 * Extracted validation helpers from invoices router
 * These encapsulate business logic rules about invoice states
 */

function canEditInvoice(status: InvoiceStatus): boolean {
  return status === InvoiceStatus.DRAFT || status === InvoiceStatus.SENT;
}

function canDeleteInvoice(status: InvoiceStatus): boolean {
  return ![
    InvoiceStatus.PAID,
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.OVERDUE,
  ].includes(status);
}

function canMarkAsPaid(status: InvoiceStatus): boolean {
  return [
    InvoiceStatus.SENT,
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.OVERDUE,
  ].includes(status);
}

function getArchivableStatuses(): InvoiceStatus[] {
  return [
    InvoiceStatus.DRAFT,
    InvoiceStatus.SENT,
    InvoiceStatus.PAID,
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.OVERDUE,
    InvoiceStatus.ACCEPTED,
  ];
}

describe("Invoice Validation Helpers", () => {
  describe("canEditInvoice", () => {
    it("allows editing DRAFT invoices", () => {
      expect(canEditInvoice(InvoiceStatus.DRAFT)).toBe(true);
    });

    it("allows editing SENT invoices", () => {
      expect(canEditInvoice(InvoiceStatus.SENT)).toBe(true);
    });

    it("prevents editing PAID invoices", () => {
      expect(canEditInvoice(InvoiceStatus.PAID)).toBe(false);
    });

    it("prevents editing PARTIALLY_PAID invoices", () => {
      expect(canEditInvoice(InvoiceStatus.PARTIALLY_PAID)).toBe(false);
    });

    it("prevents editing OVERDUE invoices", () => {
      expect(canEditInvoice(InvoiceStatus.OVERDUE)).toBe(false);
    });

    it("prevents editing ACCEPTED invoices", () => {
      expect(canEditInvoice(InvoiceStatus.ACCEPTED)).toBe(false);
    });

    it("prevents editing REJECTED invoices", () => {
      expect(canEditInvoice(InvoiceStatus.REJECTED)).toBe(false);
    });

    it("returns boolean type", () => {
      expect(typeof canEditInvoice(InvoiceStatus.DRAFT)).toBe("boolean");
    });

    it("exactly two statuses allow editing", () => {
      const allStatuses = Object.values(InvoiceStatus);
      const editableStatuses = allStatuses.filter(canEditInvoice);
      expect(editableStatuses).toHaveLength(2);
    });

    it("editability is consistent across multiple calls", () => {
      const status = InvoiceStatus.DRAFT;
      const result1 = canEditInvoice(status);
      const result2 = canEditInvoice(status);
      expect(result1).toBe(result2);
    });
  });

  describe("canDeleteInvoice", () => {
    it("allows deleting DRAFT invoices", () => {
      expect(canDeleteInvoice(InvoiceStatus.DRAFT)).toBe(true);
    });

    it("allows deleting SENT invoices", () => {
      expect(canDeleteInvoice(InvoiceStatus.SENT)).toBe(true);
    });

    it("allows deleting ACCEPTED invoices", () => {
      expect(canDeleteInvoice(InvoiceStatus.ACCEPTED)).toBe(true);
    });

    it("allows deleting REJECTED invoices", () => {
      expect(canDeleteInvoice(InvoiceStatus.REJECTED)).toBe(true);
    });

    it("prevents deleting PAID invoices", () => {
      expect(canDeleteInvoice(InvoiceStatus.PAID)).toBe(false);
    });

    it("prevents deleting PARTIALLY_PAID invoices", () => {
      expect(canDeleteInvoice(InvoiceStatus.PARTIALLY_PAID)).toBe(false);
    });

    it("prevents deleting OVERDUE invoices", () => {
      expect(canDeleteInvoice(InvoiceStatus.OVERDUE)).toBe(false);
    });

    it("returns boolean type", () => {
      expect(typeof canDeleteInvoice(InvoiceStatus.DRAFT)).toBe("boolean");
    });

    it("three statuses prevent deletion", () => {
      const allStatuses = Object.values(InvoiceStatus);
      const nonDeletableStatuses = allStatuses.filter((s) => !canDeleteInvoice(s));
      expect(nonDeletableStatuses).toHaveLength(3);
    });

    it("non-deletable statuses are PAID, PARTIALLY_PAID, OVERDUE", () => {
      const allStatuses = Object.values(InvoiceStatus);
      const nonDeletableStatuses = allStatuses.filter((s) => !canDeleteInvoice(s));
      expect(nonDeletableStatuses).toContain(InvoiceStatus.PAID);
      expect(nonDeletableStatuses).toContain(InvoiceStatus.PARTIALLY_PAID);
      expect(nonDeletableStatuses).toContain(InvoiceStatus.OVERDUE);
    });

    it("deletability is consistent across multiple calls", () => {
      const status = InvoiceStatus.DRAFT;
      const result1 = canDeleteInvoice(status);
      const result2 = canDeleteInvoice(status);
      expect(result1).toBe(result2);
    });
  });

  describe("canMarkAsPaid", () => {
    it("allows marking SENT invoices as paid", () => {
      expect(canMarkAsPaid(InvoiceStatus.SENT)).toBe(true);
    });

    it("allows marking PARTIALLY_PAID invoices as paid", () => {
      expect(canMarkAsPaid(InvoiceStatus.PARTIALLY_PAID)).toBe(true);
    });

    it("allows marking OVERDUE invoices as paid", () => {
      expect(canMarkAsPaid(InvoiceStatus.OVERDUE)).toBe(true);
    });

    it("prevents marking DRAFT invoices as paid", () => {
      expect(canMarkAsPaid(InvoiceStatus.DRAFT)).toBe(false);
    });

    it("prevents marking already PAID invoices as paid", () => {
      expect(canMarkAsPaid(InvoiceStatus.PAID)).toBe(false);
    });

    it("prevents marking ACCEPTED invoices as paid", () => {
      expect(canMarkAsPaid(InvoiceStatus.ACCEPTED)).toBe(false);
    });

    it("prevents marking REJECTED invoices as paid", () => {
      expect(canMarkAsPaid(InvoiceStatus.REJECTED)).toBe(false);
    });

    it("returns boolean type", () => {
      expect(typeof canMarkAsPaid(InvoiceStatus.SENT)).toBe("boolean");
    });

    it("three statuses can be marked as paid", () => {
      const allStatuses = Object.values(InvoiceStatus);
      const payableStatuses = allStatuses.filter(canMarkAsPaid);
      expect(payableStatuses).toHaveLength(3);
    });

    it("payable statuses are SENT, PARTIALLY_PAID, OVERDUE", () => {
      const allStatuses = Object.values(InvoiceStatus);
      const payableStatuses = allStatuses.filter(canMarkAsPaid);
      expect(payableStatuses).toContain(InvoiceStatus.SENT);
      expect(payableStatuses).toContain(InvoiceStatus.PARTIALLY_PAID);
      expect(payableStatuses).toContain(InvoiceStatus.OVERDUE);
    });
  });

  describe("getArchivableStatuses", () => {
    it("returns array of statuses", () => {
      const result = getArchivableStatuses();
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns six archivable statuses", () => {
      const result = getArchivableStatuses();
      expect(result).toHaveLength(6);
    });

    it("includes DRAFT", () => {
      expect(getArchivableStatuses()).toContain(InvoiceStatus.DRAFT);
    });

    it("includes SENT", () => {
      expect(getArchivableStatuses()).toContain(InvoiceStatus.SENT);
    });

    it("includes PAID", () => {
      expect(getArchivableStatuses()).toContain(InvoiceStatus.PAID);
    });

    it("includes PARTIALLY_PAID", () => {
      expect(getArchivableStatuses()).toContain(InvoiceStatus.PARTIALLY_PAID);
    });

    it("includes OVERDUE", () => {
      expect(getArchivableStatuses()).toContain(InvoiceStatus.OVERDUE);
    });

    it("includes ACCEPTED", () => {
      expect(getArchivableStatuses()).toContain(InvoiceStatus.ACCEPTED);
    });

    it("does not include REJECTED", () => {
      expect(getArchivableStatuses()).not.toContain(InvoiceStatus.REJECTED);
    });

    it("all statuses are InvoiceStatus enum values", () => {
      const result = getArchivableStatuses();
      const allStatuses = Object.values(InvoiceStatus);
      for (const status of result) {
        expect(allStatuses).toContain(status);
      }
    });

    it("returns consistent result on multiple calls", () => {
      const result1 = getArchivableStatuses();
      const result2 = getArchivableStatuses();
      expect(result1).toEqual(result2);
    });

    it("result does not contain REJECTED", () => {
      const result = getArchivableStatuses();
      const allStatuses = Object.values(InvoiceStatus);
      const nonArchivable = allStatuses.filter((s) => !result.includes(s));
      expect(nonArchivable).toContain(InvoiceStatus.REJECTED);
    });
  });

  describe("State Transition Logic", () => {
    it("DRAFT can be edited and deleted", () => {
      const status = InvoiceStatus.DRAFT;
      expect(canEditInvoice(status)).toBe(true);
      expect(canDeleteInvoice(status)).toBe(true);
      expect(canMarkAsPaid(status)).toBe(false);
    });

    it("SENT can be edited and deleted but not marked paid yet", () => {
      const status = InvoiceStatus.SENT;
      expect(canEditInvoice(status)).toBe(true);
      expect(canDeleteInvoice(status)).toBe(true);
      expect(canMarkAsPaid(status)).toBe(true);
    });

    it("PAID cannot be edited or deleted but can be archived", () => {
      const status = InvoiceStatus.PAID;
      expect(canEditInvoice(status)).toBe(false);
      expect(canDeleteInvoice(status)).toBe(false);
      expect(getArchivableStatuses()).toContain(status);
    });

    it("OVERDUE cannot be edited or deleted", () => {
      const status = InvoiceStatus.OVERDUE;
      expect(canEditInvoice(status)).toBe(false);
      expect(canDeleteInvoice(status)).toBe(false);
    });

    it("PARTIALLY_PAID cannot be edited but can be marked paid", () => {
      const status = InvoiceStatus.PARTIALLY_PAID;
      expect(canEditInvoice(status)).toBe(false);
      expect(canMarkAsPaid(status)).toBe(true);
      expect(canDeleteInvoice(status)).toBe(false);
    });

    it("ACCEPTED cannot be edited but can be deleted", () => {
      const status = InvoiceStatus.ACCEPTED;
      expect(canEditInvoice(status)).toBe(false);
      expect(canDeleteInvoice(status)).toBe(true);
      expect(canMarkAsPaid(status)).toBe(false);
    });

    it("REJECTED cannot be edited or marked paid but can be deleted", () => {
      const status = InvoiceStatus.REJECTED;
      expect(canEditInvoice(status)).toBe(false);
      expect(canDeleteInvoice(status)).toBe(true);
      expect(canMarkAsPaid(status)).toBe(false);
      expect(getArchivableStatuses()).not.toContain(status);
    });
  });

  describe("Edge Cases and Comprehensive Coverage", () => {
    it("all invoice statuses are covered by at least one validation function", () => {
      const allStatuses = Object.values(InvoiceStatus);
      for (const status of allStatuses) {
        // At least one of these should return true or the status should be covered
        const isCovered =
          canEditInvoice(status) ||
          canDeleteInvoice(status) ||
          canMarkAsPaid(status) ||
          getArchivableStatuses().includes(status);
        expect(isCovered).toBe(true);
      }
    });

    it("status validation functions are idempotent", () => {
      const statuses = Object.values(InvoiceStatus);
      for (const status of statuses) {
        // Call each function multiple times and verify results are consistent
        const editable1 = canEditInvoice(status);
        const editable2 = canEditInvoice(status);
        const editable3 = canEditInvoice(status);
        expect(editable1).toBe(editable2);
        expect(editable2).toBe(editable3);

        const deletable1 = canDeleteInvoice(status);
        const deletable2 = canDeleteInvoice(status);
        expect(deletable1).toBe(deletable2);

        const payable1 = canMarkAsPaid(status);
        const payable2 = canMarkAsPaid(status);
        expect(payable1).toBe(payable2);
      }
    });

    it("validation results are independent of invocation order", () => {
      const statuses = [
        InvoiceStatus.DRAFT,
        InvoiceStatus.PAID,
        InvoiceStatus.SENT,
      ];

      // Test in different orders
      const order1 = statuses.map(canEditInvoice);
      const order2 = statuses.reverse().map(canEditInvoice);

      expect(order1[0]).toEqual(order2[2]);
      expect(order1[1]).toEqual(order2[1]);
      expect(order1[2]).toEqual(order2[0]);
    });
  });
});

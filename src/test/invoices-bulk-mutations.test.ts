// src/test/invoices-bulk-mutations.test.ts
import { describe, it, expect } from "vitest";

// Pure helpers extracted from the bulk mutation logic
// These validate which invoices are eligible for each bulk action

type InvoiceStub = {
  id: string;
  status: string;
  type: string;
  clientEmail: string | null;
};

export function filterSendableInvoices(invoices: InvoiceStub[]): InvoiceStub[] {
  return invoices.filter(
    (inv) =>
      inv.status === "DRAFT" &&
      inv.type !== "CREDIT_NOTE" &&
      inv.clientEmail !== null
  );
}

export function filterMarkPaidInvoices(invoices: InvoiceStub[]): InvoiceStub[] {
  return invoices.filter((inv) =>
    ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status)
  );
}

describe("filterSendableInvoices", () => {
  it("includes DRAFT invoices with client email", () => {
    const invoices: InvoiceStub[] = [
      { id: "1", status: "DRAFT", type: "DETAILED", clientEmail: "a@b.com" },
      { id: "2", status: "SENT", type: "DETAILED", clientEmail: "c@d.com" },
      { id: "3", status: "DRAFT", type: "CREDIT_NOTE", clientEmail: "e@f.com" },
      { id: "4", status: "DRAFT", type: "DETAILED", clientEmail: null },
    ];
    const result = filterSendableInvoices(invoices);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns empty for no eligible invoices", () => {
    const invoices: InvoiceStub[] = [
      { id: "1", status: "PAID", type: "DETAILED", clientEmail: "a@b.com" },
    ];
    expect(filterSendableInvoices(invoices)).toHaveLength(0);
  });
});

describe("filterMarkPaidInvoices", () => {
  it("includes SENT, PARTIALLY_PAID, and OVERDUE invoices", () => {
    const invoices: InvoiceStub[] = [
      { id: "1", status: "SENT", type: "DETAILED", clientEmail: "a@b.com" },
      { id: "2", status: "PARTIALLY_PAID", type: "DETAILED", clientEmail: null },
      { id: "3", status: "OVERDUE", type: "SIMPLE", clientEmail: "c@d.com" },
      { id: "4", status: "DRAFT", type: "DETAILED", clientEmail: "e@f.com" },
      { id: "5", status: "PAID", type: "DETAILED", clientEmail: "g@h.com" },
    ];
    const result = filterMarkPaidInvoices(invoices);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

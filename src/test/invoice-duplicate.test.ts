import { describe, it, expect } from "vitest";
import {
  detectInvoiceDuplicate,
  type DuplicateCandidate,
  type ExistingInvoice,
} from "@/server/services/invoice-duplicate";

function existing(overrides: Partial<ExistingInvoice> = {}): ExistingInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    invoiceNumber: "INV-001",
    clientId: "client-1",
    amount: 1000,
    issueDate: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

const candidate: DuplicateCandidate = {
  clientId: "client-1",
  amount: 1000,
  issueDate: new Date("2026-06-03T00:00:00Z"),
};

describe("detectInvoiceDuplicate — matching", () => {
  it("flags a same-client, same-amount invoice within the window as a danger duplicate", () => {
    const result = detectInvoiceDuplicate(candidate, [existing()]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].severity).toBe("danger");
    expect(result.matches[0].invoiceNumber).toBe("INV-001");
  });

  it("flags an amount within tolerance (but not exact) as a warning, not danger", () => {
    const result = detectInvoiceDuplicate(candidate, [existing({ amount: 1030 })]); // +3%
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].severity).toBe("warning");
  });

  it("includes how many days apart and the amount delta percent", () => {
    const result = detectInvoiceDuplicate(candidate, [existing({ amount: 1030 })]);
    expect(result.matches[0].daysApart).toBe(2);
    expect(result.matches[0].amountDeltaPercent).toBe(3);
  });
});

describe("detectInvoiceDuplicate — non-matches", () => {
  it("does not flag a different client", () => {
    const result = detectInvoiceDuplicate(candidate, [existing({ clientId: "client-2" })]);
    expect(result.matches).toHaveLength(0);
  });

  it("does not flag an amount outside the tolerance", () => {
    const result = detectInvoiceDuplicate(candidate, [existing({ amount: 1500 })]); // +50%
    expect(result.matches).toHaveLength(0);
  });

  it("does not flag an invoice issued outside the window", () => {
    const result = detectInvoiceDuplicate(candidate, [
      existing({ issueDate: new Date("2026-04-01T00:00:00Z") }), // ~63 days earlier
    ]);
    expect(result.matches).toHaveLength(0);
  });

  it("returns no matches for an empty existing-invoice list", () => {
    const result = detectInvoiceDuplicate(candidate, []);
    expect(result.matches).toHaveLength(0);
  });
});

describe("detectInvoiceDuplicate — options", () => {
  it("respects a custom amountTolerancePercent", () => {
    const tight = detectInvoiceDuplicate(candidate, [existing({ amount: 1030 })], {
      amountTolerancePercent: 1,
    });
    expect(tight.matches).toHaveLength(0);
  });

  it("respects a custom windowDays", () => {
    const wide = detectInvoiceDuplicate(candidate, [
      existing({ issueDate: new Date("2026-04-01T00:00:00Z") }),
    ], { windowDays: 90 });
    expect(wide.matches).toHaveLength(1);
  });

  it("sorts the closest match (smallest amount delta) first", () => {
    const result = detectInvoiceDuplicate(candidate, [
      existing({ id: "far", invoiceNumber: "INV-FAR", amount: 1040 }),
      existing({ id: "near", invoiceNumber: "INV-NEAR", amount: 1000 }),
    ]);
    expect(result.matches[0].invoiceNumber).toBe("INV-NEAR");
  });
});

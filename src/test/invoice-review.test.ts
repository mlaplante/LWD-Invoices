import { describe, it, expect } from "vitest";
import {
  checkMissingInfo,
  checkSuspiciousDiscount,
  checkUnbilledTime,
  checkDuplicateRisk,
  type InvoiceReviewSnapshot,
} from "@/server/services/invoice-review";

function baseSnapshot(): InvoiceReviewSnapshot {
  return {
    invoiceId: "inv1",
    organizationId: "org1",
    total: 1000,
    discountTotal: 0,
    client: { id: "c1", name: "Acme", address: "1 St", city: "Town", country: "US", taxId: "T1", isTaxExempt: false },
    orgHasTaxConfigured: true,
    lines: [
      { id: "l1", name: "Design work", description: "Landing page", total: 1000, discount: 0, discountIsPercentage: false },
    ],
    unbilledMinutes: 0,
    recentInvoices: [],
  };
}

describe("checkMissingInfo", () => {
  it("flags a missing client billing address", () => {
    const snap = baseSnapshot();
    snap.client.address = null;
    const findings = checkMissingInfo(snap);
    expect(findings.map((f) => f.code)).toContain("missing_client_address");
  });

  it("flags a missing client tax id when the client is not tax-exempt and the org collects tax", () => {
    const snap = baseSnapshot();
    snap.client.taxId = null;
    const findings = checkMissingInfo(snap);
    expect(findings.map((f) => f.code)).toContain("missing_client_tax_id");
  });

  it("does not flag a missing tax id for a tax-exempt client", () => {
    const snap = baseSnapshot();
    snap.client.taxId = null;
    snap.client.isTaxExempt = true;
    expect(checkMissingInfo(snap).map((f) => f.code)).not.toContain("missing_client_tax_id");
  });
});

describe("checkSuspiciousDiscount", () => {
  it("flags an invoice-level discount above 25% of total", () => {
    const snap = baseSnapshot();
    snap.total = 700;
    snap.discountTotal = 300;
    expect(checkSuspiciousDiscount(snap).map((f) => f.code)).toContain("suspicious_invoice_discount");
  });

  it("flags a line discount above 30%", () => {
    const snap = baseSnapshot();
    snap.lines[0] = { id: "l1", name: "X", description: null, total: 700, discount: 40, discountIsPercentage: true };
    expect(checkSuspiciousDiscount(snap).map((f) => f.code)).toContain("suspicious_line_discount");
  });

  it("does not flag a modest discount", () => {
    const snap = baseSnapshot();
    snap.discountTotal = 50;
    expect(checkSuspiciousDiscount(snap)).toEqual([]);
  });
});

describe("checkUnbilledTime", () => {
  it("flags when unbilled minutes exceed the threshold", () => {
    const snap = baseSnapshot();
    snap.unbilledMinutes = 90;
    expect(checkUnbilledTime(snap).map((f) => f.code)).toContain("unbilled_time");
  });

  it("ignores a trivial amount of unbilled time", () => {
    const snap = baseSnapshot();
    snap.unbilledMinutes = 5;
    expect(checkUnbilledTime(snap)).toEqual([]);
  });
});

describe("checkDuplicateRisk", () => {
  it("flags a same-client invoice with a near-identical total and overlapping lines", () => {
    const snap = baseSnapshot();
    snap.total = 1000;
    snap.lines = [{ id: "l1", name: "Design work", description: null, total: 1000, discount: 0, discountIsPercentage: false }];
    snap.recentInvoices = [
      { id: "old", number: "INV-9", total: 1000, createdAt: new Date(), lineNames: ["Design work"] },
    ];
    expect(checkDuplicateRisk(snap).map((f) => f.code)).toContain("duplicate_invoice_risk");
  });

  it("does not flag when totals differ materially", () => {
    const snap = baseSnapshot();
    snap.total = 1000;
    snap.recentInvoices = [
      { id: "old", number: "INV-9", total: 250, createdAt: new Date(), lineNames: ["Design work"] },
    ];
    expect(checkDuplicateRisk(snap)).toEqual([]);
  });
});

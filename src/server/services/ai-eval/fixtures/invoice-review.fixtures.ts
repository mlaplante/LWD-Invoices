import type { EvalCase } from "../types";
import type { InvoiceReviewInput, InvoiceReviewExpected } from "../graders";
import type { InvoiceReviewSnapshot } from "../../invoice-review";

function snap(overrides: Partial<InvoiceReviewSnapshot>): InvoiceReviewSnapshot {
  return {
    invoiceId: "inv",
    organizationId: "org1",
    total: 1000,
    discountTotal: 0,
    client: { id: "c1", name: "Acme", address: "1 St", city: "Town", country: "US", taxId: "T1", isTaxExempt: false },
    orgHasTaxConfigured: true,
    lines: [{ id: "l1", name: "Design work", description: "Landing page", total: 1000, discount: 0, discountIsPercentage: false }],
    unbilledMinutes: 0,
    recentInvoices: [],
    ...overrides,
  };
}

export const invoiceReviewCases: EvalCase<InvoiceReviewInput, InvoiceReviewExpected>[] = [
  {
    id: "missing-address",
    description: "incomplete billing address is flagged",
    input: { snapshot: snap({ client: { id: "c1", name: "Acme", address: null, city: null, country: null, taxId: "T1", isTaxExempt: false } }) },
    expected: { expectCodes: ["missing_client_address"] },
  },
  {
    id: "tax-exempt-no-flag",
    description: "tax-exempt client is not flagged for a missing tax id",
    input: { snapshot: snap({ client: { id: "c1", name: "Acme", address: "1 St", city: "Town", country: "US", taxId: null, isTaxExempt: true } }) },
    expected: { forbidCodes: ["missing_client_tax_id"] },
  },
  {
    id: "duplicate-risk",
    description: "near-identical same-client invoice is flagged",
    input: {
      snapshot: snap({
        total: 1000,
        recentInvoices: [{ id: "old", number: "INV-9", total: 1000, createdAt: new Date(0), lineNames: ["Design work"] }],
      }),
    },
    expected: { expectCodes: ["duplicate_invoice_risk"] },
  },
  {
    id: "grounding-drops-fabricated-line",
    description: "CRITICAL: a model flag pointing at a non-existent line is dropped",
    critical: true,
    input: {
      snapshot: snap({}),
      modelFlags: [
        { lineId: "l1", reason: "too vague" },
        { lineId: "ghost", reason: "fabricated" },
      ],
    },
    expected: { expectGroundedLineIds: ["l1"] },
  },
];

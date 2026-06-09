export type ReviewSeverity = "info" | "warning";

export interface ReviewFinding {
  /** Stable machine code, e.g. "missing_client_address". */
  code: string;
  severity: ReviewSeverity;
  /** Human-readable, surfaced verbatim in the pre-send panel. */
  message: string;
  /** Invoice fields/lines this finding points at (for UI highlighting). */
  fields: string[];
}

export interface InvoiceReviewSnapshotLine {
  id: string;
  name: string;
  description: string | null;
  total: number;
  discount: number;
  discountIsPercentage: boolean;
}

export interface InvoiceReviewClient {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  taxId: string | null;
  isTaxExempt: boolean;
}

export interface RecentInvoiceSignature {
  id: string;
  number: string;
  total: number;
  createdAt: Date;
  lineNames: string[];
}

export interface InvoiceReviewSnapshot {
  invoiceId: string;
  organizationId: string;
  total: number;
  discountTotal: number;
  client: InvoiceReviewClient;
  orgHasTaxConfigured: boolean;
  lines: InvoiceReviewSnapshotLine[];
  /** Minutes of unbilled time tracked against this invoice's client/project. */
  unbilledMinutes: number;
  /** Same-client invoices in the duplicate-detection window (excludes this one). */
  recentInvoices: RecentInvoiceSignature[];
}

// Tunable thresholds — named so the eval suite and UI copy stay in sync.
export const INVOICE_DISCOUNT_PCT_LIMIT = 0.25; // invoice-level discount / total
export const LINE_DISCOUNT_PCT_LIMIT = 0.3; // per-line percentage discount

export function checkMissingInfo(snap: InvoiceReviewSnapshot): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  if (!snap.client.address || !snap.client.city || !snap.client.country) {
    findings.push({
      code: "missing_client_address",
      severity: "warning",
      message: `${snap.client.name} is missing a complete billing address (street, city, and country).`,
      fields: ["client.address", "client.city", "client.country"],
    });
  }
  if (snap.orgHasTaxConfigured && !snap.client.isTaxExempt && !snap.client.taxId) {
    findings.push({
      code: "missing_client_tax_id",
      severity: "info",
      message: `${snap.client.name} has no tax ID on file and is not marked tax-exempt.`,
      fields: ["client.taxId"],
    });
  }
  return findings;
}

export function checkSuspiciousDiscount(snap: InvoiceReviewSnapshot): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const grossTotal = snap.total + snap.discountTotal;
  if (grossTotal > 0 && snap.discountTotal / grossTotal > INVOICE_DISCOUNT_PCT_LIMIT) {
    const pct = Math.round((snap.discountTotal / grossTotal) * 100);
    findings.push({
      code: "suspicious_invoice_discount",
      severity: "warning",
      message: `Invoice-level discount is ${pct}% of the pre-discount total — confirm this is intended.`,
      fields: ["discountTotal"],
    });
  }
  for (const line of snap.lines) {
    if (line.discountIsPercentage && line.discount / 100 > LINE_DISCOUNT_PCT_LIMIT) {
      findings.push({
        code: "suspicious_line_discount",
        severity: "warning",
        message: `Line "${line.name}" has a ${line.discount}% discount — confirm this is intended.`,
        fields: [`line:${line.id}`],
      });
    }
  }
  return findings;
}

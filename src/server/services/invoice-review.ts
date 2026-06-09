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

export const UNBILLED_MINUTES_LIMIT = 30; // half an hour of untracked work is worth surfacing
export const DUPLICATE_TOTAL_TOLERANCE = 0.01; // within 1% of an existing invoice total
export const DUPLICATE_LINE_OVERLAP = 0.5; // at least half the line names match

export function checkUnbilledTime(snap: InvoiceReviewSnapshot): ReviewFinding[] {
  if (snap.unbilledMinutes <= UNBILLED_MINUTES_LIMIT) return [];
  const hours = (snap.unbilledMinutes / 60).toFixed(1);
  return [
    {
      code: "unbilled_time",
      severity: "info",
      message: `There are ${hours}h of unbilled time tracked for this client not attached to any invoice line.`,
      fields: ["lines"],
    },
  ];
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function checkDuplicateRisk(snap: InvoiceReviewSnapshot): ReviewFinding[] {
  if (snap.total <= 0) return [];
  const thisLineNames = new Set(snap.lines.map((l) => normalizeName(l.name)));
  for (const recent of snap.recentInvoices) {
    const totalClose =
      Math.abs(recent.total - snap.total) / snap.total <= DUPLICATE_TOTAL_TOLERANCE;
    if (!totalClose) continue;
    const recentNames = recent.lineNames.map(normalizeName);
    const overlap =
      recentNames.length === 0
        ? 0
        : recentNames.filter((n) => thisLineNames.has(n)).length / recentNames.length;
    if (overlap >= DUPLICATE_LINE_OVERLAP) {
      return [
        {
          code: "duplicate_invoice_risk",
          severity: "warning",
          message: `This looks similar to invoice ${recent.number} (same client, near-identical total and line items). Confirm it isn't a duplicate.`,
          fields: ["total", "lines"],
        },
      ];
    }
  }
  return [];
}

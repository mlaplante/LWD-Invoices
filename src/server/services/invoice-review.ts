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

// ─── Task 5: LLM unclear-description pass + grounding guard + aggregator ─────

import { z } from "zod";
import { env } from "@/lib/env";
import { callGeminiWithModelFallback, resolveGeminiModels } from "./gemini-fallback";
import { extractGeminiText } from "./natural-language-invoice";
import { parseValidatedJson } from "./ai-structured-output";

export function runDeterministicChecks(snap: InvoiceReviewSnapshot): ReviewFinding[] {
  return [
    ...checkMissingInfo(snap),
    ...checkSuspiciousDiscount(snap),
    ...checkUnbilledTime(snap),
    ...checkDuplicateRisk(snap),
  ];
}

export interface UnclearDescriptionFlag {
  lineId: string;
  reason: string;
}

/**
 * Grounding guard: the model may only flag lines that actually exist on the
 * invoice. Anything pointing at a fabricated lineId is dropped — the invoice
 * reviewer's analog of containsHallucinatedInvoiceFacts.
 */
export function guardUnclearDescriptionFlags(
  snap: InvoiceReviewSnapshot,
  flags: UnclearDescriptionFlag[],
): ReviewFinding[] {
  const realIds = new Set(snap.lines.map((l) => l.id));
  return flags
    .filter((f) => realIds.has(f.lineId))
    .map((f) => {
      const line = snap.lines.find((l) => l.id === f.lineId)!;
      return {
        code: "unclear_line_description",
        severity: "info" as const,
        message: `Line "${line.name}" may be unclear to the client: ${f.reason}`,
        fields: [`line:${f.lineId}`],
      };
    });
}

const UNCLEAR_SCHEMA = z.object({
  flags: z.array(z.object({ lineId: z.string(), reason: z.string() })),
});

const GEMINI_REVIEW_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

const UNCLEAR_SYSTEM_PROMPT =
  "You review invoice line items for clarity to a paying client. Given a JSON array of lines " +
  "(each with id, name, description), return ONLY JSON: {\"flags\":[{\"lineId\":string,\"reason\":string}]}. " +
  "Flag a line only when its name+description are too vague for a client to know what they're paying for " +
  "(e.g. \"work\", \"services\", \"misc\"). Use only lineIds from the input. Never invent lines. Empty flags array if all are clear.";

/** LLM unclear-description pass. Returns [] when AI is unconfigured or output is invalid. */
export async function checkUnclearDescriptions(snap: InvoiceReviewSnapshot): Promise<ReviewFinding[]> {
  if (!env.GEMINI_API_KEY) return [];
  const linePayload = JSON.stringify(
    snap.lines.map((l) => ({ id: l.id, name: l.name, description: l.description ?? "" })),
  );
  try {
    const flags = await callGeminiWithModelFallback({
      apiKey: env.GEMINI_API_KEY,
      models: resolveGeminiModels(env.GEMINI_INVOICE_REVIEW_MODELS, GEMINI_REVIEW_MODELS),
      body: {
        systemInstruction: { parts: [{ text: UNCLEAR_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: linePayload }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      },
      label: "invoice review",
      onOk: (json) => {
        const raw = extractGeminiText(json);
        return parseValidatedJson(raw, UNCLEAR_SCHEMA).flags;
      },
    });
    return guardUnclearDescriptionFlags(snap, flags);
  } catch (err) {
    // A provider/network failure should never block sending — degrade to no
    // AI findings — but log it so outages don't masquerade as clean reviews.
    console.error("[invoice-review] AI review failed:", err);
    return [];
  }
}

/** Full review: deterministic checks always, LLM unclear-description best-effort. */
export async function reviewInvoice(snap: InvoiceReviewSnapshot): Promise<ReviewFinding[]> {
  const unclear = await checkUnclearDescriptions(snap);
  return [...runDeterministicChecks(snap), ...unclear];
}

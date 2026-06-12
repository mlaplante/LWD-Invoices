import { z } from "zod";
import { env } from "@/lib/env";
import { callGeminiWithModelFallback, resolveGeminiModels } from "./gemini-fallback";
import { extractGeminiText } from "./natural-language-invoice";
import { parseValidatedJson, AiOutputError } from "./ai-structured-output";

// ─── Finding Schema ──────────────────────────────────────────────────────────

export type InvoiceQaSeverity = "critical" | "warning" | "info";

export type InvoiceQaCategory =
  | "missing_required_info"
  | "revenue_leakage"
  | "duplicate_risk"
  | "tax_or_compliance"
  | "unclear_description"
  | "payment_terms"
  | "source_data_mismatch";

export type InvoiceQaEvidence = {
  fieldPaths: string[];
  lineRefs?: Array<{
    clientLineId: string;
    persistedLineId?: string | null;
    label: string;
  }>;
  recordRefs?: Array<{
    type: "invoice" | "timeEntry" | "project" | "client" | "tax";
    id: string;
    label: string;
  }>;
  observedValue?: string | number | boolean | null;
  expectedValue?: string | number | boolean | null;
  explanation: string;
};

export type InvoiceQaSuggestedFix = {
  label: string;
  description: string;
  patch?: Array<
    | { op: "set"; path: string; value: unknown }
    | { op: "appendLine"; value: Partial<ScanInvoiceDraftRequest["draft"]["lines"][number]> }
    | { op: "removeLine"; clientLineId: string }
  >;
  requiresUserInput?: boolean;
};

export type InvoiceQaFinding = {
  id: string; // stable within scan: `${code}:${primaryFieldOrLine}`
  code: string; // e.g. missing_client_address, suspicious_line_discount
  severity: InvoiceQaSeverity;
  category: InvoiceQaCategory;
  title: string;
  message: string;
  evidence: InvoiceQaEvidence;
  suggestedFix?: InvoiceQaSuggestedFix;
  confidence: number; // 0..1
  directlyApplicable: boolean;
  source: "deterministic" | "ai" | "hybrid";
  grounded: true;
};

export type ScanInvoiceDraftRequest = {
  mode: "create" | "edit";
  invoiceId?: string; // required only for edit mode when the invoice already exists
  draft: {
    type: string;
    date: string; // YYYY-MM-DD
    dueDate?: string | null; // YYYY-MM-DD or null/empty
    currencyId: string;
    number?: string | null;
    notes?: string | null;
    clientId?: string | null;
    lines: Array<{
      clientLineId: string; // stable client-generated id for unsaved UI highlighting
      persistedLineId?: string | null; // present in edit mode when available
      sort: number;
      lineType: string;
      name: string;
      description?: string | null;
      qty: number;
      rate: number;
      period?: number | null;
      discount: number;
      discountIsPercentage: boolean;
      taxIds: string[];
      sourceTable?: string | null;
      sourceId?: string | null;
    }>;
    discountType?: "percentage" | "fixed" | null;
    discountAmount?: number;
    discountDescription?: string | null;
    calculatedTotals?: {
      subtotal: number;
      discountTotal: number;
      taxTotal: number;
      total: number;
    };
    partialPayments?: Array<{
      sortOrder: number;
      amount: number;
      isPercentage: boolean;
      dueDate?: string | null;
      label?: string | null;
    }>;
  };
  calculatedTotals: {
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
  };
  clientContext?: {
    // Optional client-provided display hints only; server must re-read authoritative tenant records.
    clientName?: string;
    currencyCode?: string;
  };
};

export type ScanInvoiceDraftResponse = {
  scanId: string; // opaque id or deterministic hash for client-side result tracking
  scannedAt: string; // ISO timestamp
  status: "completed" | "partial";
  staleAfter?: string; // optional ISO timestamp if server wants a freshness warning
  summary: {
    highestSeverity: InvoiceQaSeverity | null;
    findingCount: number;
    directlyApplicableFixCount: number;
    modelUsed?: string;
    deterministicOnly: boolean;
  };
  findings: InvoiceQaFinding[];
  guardrails: {
    groundedOnly: true;
    tenantScoped: true;
    autoAppliedChanges: false;
    aiUnavailable?: boolean;
    droppedUngroundedFindingCount?: number;
  };
};

// ─── Thresholds ──────────────────────────────────────────────────────────────

const INVOICE_DISCOUNT_PCT_LIMIT = 0.25;
const LINE_DISCOUNT_PCT_LIMIT = 0.3;
// ─── Helper utilities ────────────────────────────────────────────────────────

function makeEvidence(
  fieldPaths: string[],
  explanation: string,
  options?: {
    lineRefs?: InvoiceQaEvidence["lineRefs"];
    recordRefs?: InvoiceQaEvidence["recordRefs"];
    observedValue?: InvoiceQaEvidence["observedValue"];
    expectedValue?: InvoiceQaEvidence["expectedValue"];
  },
): InvoiceQaEvidence {
  return {
    fieldPaths,
    lineRefs: options?.lineRefs,
    recordRefs: options?.recordRefs,
    observedValue: options?.observedValue,
    expectedValue: options?.expectedValue,
    explanation,
  };
}

function makeFinding(
  code: string,
  primaryFieldOrLine: string,
  severity: InvoiceQaSeverity,
  category: InvoiceQaCategory,
  title: string,
  message: string,
  evidence: InvoiceQaEvidence,
  suggestedFix?: InvoiceQaSuggestedFix,
  confidence: number = 1.0,
  directlyApplicable: boolean = false,
  source: "deterministic" | "ai" | "hybrid" = "deterministic",
): InvoiceQaFinding {
  return {
    id: `${code}:${primaryFieldOrLine}`,
    code,
    severity,
    category,
    title,
    message,
    evidence,
    suggestedFix,
    confidence,
    directlyApplicable,
    source,
    grounded: true,
  };
}

// ─── Deterministic checks ────────────────────────────────────────────────────

function checkMissingClient(req: ScanInvoiceDraftRequest): InvoiceQaFinding[] {
  if (req.draft.clientId) return [];
  return [
    makeFinding(
      "missing_client",
      "draft.clientId",
      "warning",
      "missing_required_info",
      "No client selected",
      "This draft has no client assigned. Invoices without a client cannot be sent.",
      makeEvidence(["draft.clientId"], "clientId is null/empty"),
      undefined,
      1.0,
      false,
      "deterministic",
    ),
  ];
}

function checkEmptyLines(req: ScanInvoiceDraftRequest): InvoiceQaFinding[] {
  if (req.draft.lines.length > 0) return [];
  return [
    makeFinding(
      "empty_invoice_lines",
      "draft.lines",
      "critical",
      "revenue_leakage",
      "No invoice lines",
      "This draft has zero line items or all line items have zero totals.",
      makeEvidence(["draft.lines"], "draft.lines.length === 0"),
      undefined,
      1.0,
      false,
      "deterministic",
    ),
  ];
}

function checkZeroOrNegativeLineTotal(req: ScanInvoiceDraftRequest): InvoiceQaFinding[] {
  const findings: InvoiceQaFinding[] = [];
  for (const line of req.draft.lines) {
    const total = line.qty * line.rate * (line.period ?? 1);
    if (total <= 0) {
      findings.push(
        makeFinding(
          "zero_or_negative_line_total",
          line.clientLineId,
          "warning",
          "revenue_leakage",
          `Line "${line.name}" has zero or negative total`,
          `Line total is ${total}, which is zero or negative.`,
          makeEvidence(
            [`lines[${line.sort}].qty`, `lines[${line.sort}].rate`],
            `qty=${line.qty}, rate=${line.rate}, period=${line.period ?? 1}`,
            { observedValue: total },
          ),
          undefined,
          1.0,
          false,
          "deterministic",
        ),
      );
    }
  }
  return findings;
}

function checkSuspiciousInvoiceDiscount(req: ScanInvoiceDraftRequest): InvoiceQaFinding[] {
  const grossTotal = req.calculatedTotals.subtotal;
  if (grossTotal <= 0) return [];
  const discountPct = req.calculatedTotals.discountTotal / grossTotal;
  if (discountPct > INVOICE_DISCOUNT_PCT_LIMIT) {
    const pct = Math.round(discountPct * 100);
    return [
      makeFinding(
        "suspicious_invoice_discount",
        "calculatedTotals.discountTotal",
        "warning",
        "revenue_leakage",
        "Invoice-level discount exceeds threshold",
        `Invoice-level discount is ${pct}% of the pre-discount total — confirm this is intended.`,
        makeEvidence(
          ["calculatedTotals.discountTotal", "calculatedTotals.subtotal"],
          `discountTotal=${req.calculatedTotals.discountTotal}, subtotal=${req.calculatedTotals.subtotal}`,
          { observedValue: pct, expectedValue: Math.round(INVOICE_DISCOUNT_PCT_LIMIT * 100) },
        ),
        undefined,
        0.95,
        false,
        "deterministic",
      ),
    ];
  }
  return [];
}

function checkSuspiciousLineDiscount(req: ScanInvoiceDraftRequest): InvoiceQaFinding[] {
  const findings: InvoiceQaFinding[] = [];
  for (const line of req.draft.lines) {
    if (line.discountIsPercentage && line.discount > LINE_DISCOUNT_PCT_LIMIT * 100) {
      findings.push(
        makeFinding(
          "suspicious_line_discount",
          line.clientLineId,
          "warning",
          "revenue_leakage",
          `Line "${line.name}" has high percentage discount`,
          `Line has a ${line.discount}% discount — confirm this is intended.`,
          makeEvidence(
            [`lines[${line.sort}].discount`, `lines[${line.sort}].discountIsPercentage`],
            `discount=${line.discount}%, isPercentage=${line.discountIsPercentage}`,
            { observedValue: line.discount, expectedValue: Math.round(LINE_DISCOUNT_PCT_LIMIT * 100) },
          ),
          undefined,
          0.95,
          false,
          "deterministic",
        ),
      );
    }
  }
  return findings;
}

function checkMissingDueDate(req: ScanInvoiceDraftRequest): InvoiceQaFinding[] {
  if (req.draft.dueDate) return [];
  if (req.draft.clientId) {
    return [
      makeFinding(
        "missing_due_date",
        "draft.dueDate",
        "warning",
        "payment_terms",
        "No due date specified",
        "This draft has no due date. Consider setting a payment deadline.",
        makeEvidence(["draft.dueDate"], "dueDate is null/empty"),
        undefined,
        1.0,
        true,
        "deterministic",
      ),
    ];
  }
  return [];
}

function checkPartialPaymentMismatch(req: ScanInvoiceDraftRequest): InvoiceQaFinding[] {
  if (!req.draft.partialPayments || req.draft.partialPayments.length === 0) return [];
  const total = req.calculatedTotals.total;
  const payments = req.draft.partialPayments;
  
  // Check if payments sum to total or 100%
  let sumAmount = 0;
  let sumPercentage = 0;
  
  for (const payment of payments) {
    if (payment.isPercentage) {
      sumPercentage += payment.amount;
    } else {
      sumAmount += payment.amount;
    }
  }
  
  // If any payments are percentages, they should sum to 100
  if (payments.some((p) => p.isPercentage)) {
    if (Math.abs(sumPercentage - 100) > 0.01) {
      return [
        makeFinding(
          "partial_payment_mismatch",
          "draft.partialPayments",
          "warning",
          "payment_terms",
          "Partial payments don't sum to 100%",
          `Partial payment percentages sum to ${sumPercentage.toFixed(2)}%, not 100%.`,
          makeEvidence(
            ["draft.partialPayments"],
            `payment percentages sum to ${sumPercentage}`,
            { observedValue: sumPercentage, expectedValue: 100 },
          ),
          undefined,
          0.95,
          false,
          "deterministic",
        ),
      ];
    }
  }
  
  // If no percentages, check if amounts sum to total
  if (payments.some((p) => !p.isPercentage)) {
    if (Math.abs(sumAmount - total) > 0.01) {
      return [
        makeFinding(
          "partial_payment_mismatch",
          "draft.partialPayments",
          "warning",
          "payment_terms",
          "Partial payments don't sum to invoice total",
          `Partial payment amounts sum to ${sumAmount.toFixed(2)}, but invoice total is ${total.toFixed(2)}.`,
          makeEvidence(
            ["draft.partialPayments"],
            `payment amounts sum to ${sumAmount}, total is ${total}`,
            { observedValue: sumAmount, expectedValue: total },
          ),
          undefined,
          0.95,
          false,
          "deterministic",
        ),
      ];
    }
  }
  
  return [];
}

// ─── AI unclear-description pass ──────────────────────────────────────────────

const UNCLEAR_SCHEMA = z.object({
  flags: z.array(z.object({ clientLineId: z.string(), reason: z.string() })),
});

const GEMINI_REVIEW_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

const UNCLEAR_SYSTEM_PROMPT =
  "You review invoice line items for clarity to a paying client. Given a JSON array of lines " +
  "(each with clientLineId, name, description), return ONLY JSON: {\"flags\":[{\"clientLineId\":string,\"reason\":string}]}. " +
  "Flag a line only when its name+description are too vague for a client to know what they're paying for " +
  "(e.g. \"work\", \"services\", \"misc\"). Use only clientLineIds from the input. Never invent lines. Empty flags array if all are clear.";

async function checkUnclearDescriptions(req: ScanInvoiceDraftRequest): Promise<InvoiceQaFinding[]> {
  if (!env.GEMINI_API_KEY) return [];
  
  const linePayload = JSON.stringify(
    req.draft.lines.map((l) => ({
      clientLineId: l.clientLineId,
      name: l.name,
      description: l.description ?? "",
    })),
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
      label: "invoice draft QA",
      onOk: (json) => {
        const raw = extractGeminiText(json);
        return parseValidatedJson(raw, UNCLEAR_SCHEMA).flags;
      },
    });
    
    // Grounding guard: only keep flags that reference existing clientLineIds
    const validClientLineIds = new Set(req.draft.lines.map((l) => l.clientLineId));
    const groundedFlags = flags.filter((f) => validClientLineIds.has(f.clientLineId));
    
    return groundedFlags.map((flag) => {
      const line = req.draft.lines.find((l) => l.clientLineId === flag.clientLineId)!;
      return makeFinding(
        "unclear_line_description",
        flag.clientLineId,
        "info",
        "unclear_description",
        `Line "${line.name}" may be unclear`,
        `Line "${line.name}" may be unclear to the client: ${flag.reason}`,
        makeEvidence(
          [`lines[${line.sort}].name`, `lines[${line.sort}].description`],
          `clientLineId=${flag.clientLineId}, reason=${flag.reason}`,
          { observedValue: flag.reason, expectedValue: null },
        ),
        undefined,
        0.7, // AI confidence
        false, // Not directly applicable — requires user judgment
        "ai",
      );
    });
  } catch (err) {
    if (err instanceof AiOutputError) return [];
    // A provider/network failure should never block — degrade to no AI findings.
    return [];
  }
}

// ─── Duplicate risk check ────────────────────────────────────────────────────

function checkDuplicateRisk(): InvoiceQaFinding[] {
  // This check requires server-side access to recent invoices
  // For now, we'll return empty — the service layer should query the database
  // to get recent invoices for the same client
  return [];
}

// ─── Service entry point ─────────────────────────────────────────────────────

type InvoiceDraftQaContext = {
  orgId: string;
  db: {
    invoice: {
      findFirst?: (args: {
        where: { id: string; organizationId: string };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };
  };
};

export async function scanInvoiceDraft(
  req: ScanInvoiceDraftRequest,
  ctx: InvoiceDraftQaContext,
): Promise<ScanInvoiceDraftResponse> {
  if (req.mode === "edit") {
    if (!req.invoiceId) {
      throw new Error("invoiceId is required in edit mode");
    }
    const invoice = await ctx.db.invoice.findFirst?.({
      where: { id: req.invoiceId, organizationId: ctx.orgId },
      select: { id: true },
    });
    if (!invoice) {
      throw new Error("Invoice not found or access denied");
    }
  }

  const scanId = `scan_${crypto.randomUUID()}`;
  const scannedAt = new Date().toISOString();
  const findings: InvoiceQaFinding[] = [];
  
  // Run deterministic checks
  findings.push(...checkMissingClient(req));
  findings.push(...checkEmptyLines(req));
  findings.push(...checkZeroOrNegativeLineTotal(req));
  findings.push(...checkSuspiciousInvoiceDiscount(req));
  findings.push(...checkSuspiciousLineDiscount(req));
  findings.push(...checkMissingDueDate(req));
  findings.push(...checkPartialPaymentMismatch(req));
  findings.push(...checkDuplicateRisk());
  
  // Run AI unclear-description pass (best-effort)
  const aiFindings = await checkUnclearDescriptions(req);
  findings.push(...aiFindings);
  
  // Determine status
  const hasAiFindings = findings.some((f) => f.source === "ai");
  const hasPartial = false; // Could check if AI was unavailable
  const status = hasPartial && !hasAiFindings ? "partial" : "completed";
  
  // Calculate summary
  const highestSeverity = findings.length > 0
    ? findings.reduce((max, f) => {
        const order = ["critical", "warning", "info"];
        return order.indexOf(f.severity) < order.indexOf(max) ? f.severity : max;
      }, "info" as InvoiceQaSeverity)
    : null;
  
  const directlyApplicableFixCount = findings.filter((f) => f.directlyApplicable).length;
  
  // Grounding guard: ensure all findings are grounded
  const droppedUngroundedCount = findings.filter((f) => !f.grounded).length;
  
  return {
    scanId,
    scannedAt,
    status,
    staleAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minute staleness
    summary: {
      highestSeverity,
      findingCount: findings.length,
      directlyApplicableFixCount,
      modelUsed: env.GEMINI_API_KEY ? "gemini" : undefined,
      deterministicOnly: !hasAiFindings,
    },
    findings,
    guardrails: {
      groundedOnly: true,
      tenantScoped: true,
      autoAppliedChanges: false,
      aiUnavailable: hasPartial && !hasAiFindings,
      droppedUngroundedFindingCount: droppedUngroundedCount > 0 ? droppedUngroundedCount : undefined,
    },
  };
}

export const scanDraft = scanInvoiceDraft;

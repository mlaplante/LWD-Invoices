# AI Features — Plan 1: Scaffold + Invoice Reviewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared AI-features scaffold (per-feature env vars + a shared structured-output validation helper) and the first vertical slice — an advisory pre-send invoice reviewer.

**Architecture:** A pure, deterministic review core (`invoice-review.ts`) runs five checks over an org-scoped invoice snapshot; four are deterministic (missing info, suspicious discount, unbilled time, duplicate risk) and one (unclear line descriptions) uses the Gemini-first fallback chain with a grounding guard so it can only flag real line text. A tRPC query exposes it read-only; a React panel surfaces findings before send. A golden-set eval suite pins the deterministic checks.

**Tech Stack:** Next.js 16 (App Router), tRPC, Prisma, Zod, Vitest, the existing `gemini-fallback.ts` runner and `ai-eval` harness.

---

## File Structure

- Create: `src/server/services/ai-structured-output.ts` — shared `parseAndValidate(raw, schema)` used by every AI feature to turn a raw model JSON string into a Zod-validated object (or throw a typed error the caller converts to a deterministic fallback).
- Create: `src/server/services/invoice-review.ts` — pure deterministic checks + the LLM unclear-description pass + `reviewInvoice` aggregator. One responsibility: produce `ReviewFinding[]` from an invoice snapshot.
- Create: `src/server/routers/invoiceReview.ts` — `review({ invoiceId })` read-only query, org-scoped.
- Modify: `src/server/routers/_app.ts` — register `invoiceReview`.
- Modify: `src/lib/env.ts` — add per-feature env vars (this plan: invoice-review; later plans add their own).
- Create: `src/server/services/ai-eval/fixtures/invoice-review.fixtures.ts` — golden cases incl. cross-tenant + hallucinated-description.
- Modify: `src/server/services/ai-eval/graders.ts` — add `gradeInvoiceReview`.
- Modify: `src/server/services/ai-eval/index.ts` — register the `invoice-review` suite + re-exports.
- Create: `src/test/ai-eval/invoice-review.eval.test.ts` — CI gate for the suite.
- Create: `src/test/invoice-review.test.ts` — unit tests for the deterministic checks.
- Create: `src/components/invoices/InvoiceReviewPanel.tsx` — pre-send findings panel.

---

## Task 1: Per-feature env vars (scaffold)

**Files:**
- Modify: `src/lib/env.ts` (schema block near line 58, and the runtime map near line 109)

- [ ] **Step 1: Add the invoice-review env vars to the schema**

In the `z.object({ ... })` server schema, after the `GEMINI_INVOICE_PARSER_MODELS` entry, add:

```ts
    // Which provider powers the AI invoice reviewer's "unclear line description"
    // check. Defaults to Gemini (its 429 model-fallback chain) when GEMINI_API_KEY
    // is set, otherwise Anthropic/OpenAI. Set explicitly to pin a provider.
    INVOICE_REVIEW_AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).optional(),
    // Comma-separated, ordered Gemini model fallback chain for the invoice
    // reviewer (same 429 fallback behavior as GEMINI_OCR_MODELS). Leave unset for
    // the built-in default chain.
    GEMINI_INVOICE_REVIEW_MODELS: z.string().min(1).optional(),
```

- [ ] **Step 2: Wire them into the runtime env map**

In the `runtimeEnv` / explicit process.env map (near line 109), add:

```ts
    INVOICE_REVIEW_AI_PROVIDER: process.env.INVOICE_REVIEW_AI_PROVIDER,
    GEMINI_INVOICE_REVIEW_MODELS: process.env.GEMINI_INVOICE_REVIEW_MODELS,
```

- [ ] **Step 3: Verify the app still type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors (env additions are optional).

- [ ] **Step 4: Document the vars in `.env.example`**

Append under the existing AI section of `.env.example`:

```
# AI invoice reviewer (unclear-line-description check). Defaults to Gemini.
# INVOICE_REVIEW_AI_PROVIDER=gemini
# GEMINI_INVOICE_REVIEW_MODELS=gemini-2.0-flash,gemini-2.5-flash,gemini-1.5-flash
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(ai-review): add invoice-review provider env vars"
```

---

## Task 2: Shared structured-output validation helper

**Files:**
- Create: `src/server/services/ai-structured-output.ts`
- Test: `src/test/ai-structured-output.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseValidatedJson, AiOutputError } from "@/server/services/ai-structured-output";

const schema = z.object({ flags: z.array(z.string()) });

describe("parseValidatedJson", () => {
  it("parses and validates well-formed JSON", () => {
    expect(parseValidatedJson('{"flags":["a","b"]}', schema)).toEqual({ flags: ["a", "b"] });
  });

  it("throws AiOutputError on non-JSON", () => {
    expect(() => parseValidatedJson("not json", schema)).toThrow(AiOutputError);
  });

  it("throws AiOutputError when the shape is wrong", () => {
    expect(() => parseValidatedJson('{"flags":"nope"}', schema)).toThrow(AiOutputError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/ai-structured-output.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { z } from "zod";

/**
 * Thrown when a model's raw output can't be parsed or doesn't match the schema.
 * Callers catch this and fall back to deterministic behavior rather than
 * surfacing a half-parsed AI result. Shared by every AI feature so they all
 * fail the same way (mirrors the normalizeExtraction discipline in
 * natural-language-invoice.ts).
 */
export class AiOutputError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AiOutputError";
  }
}

/** Parse a raw model JSON string and validate it against `schema`. */
export function parseValidatedJson<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AiOutputError("model output was not valid JSON", err);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiOutputError(`model output failed schema validation: ${result.error.message}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/ai-structured-output.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ai-structured-output.ts src/test/ai-structured-output.test.ts
git commit -m "feat(ai): shared structured-output parse+validate helper"
```

---

## Task 3: Deterministic review checks (types + missing-info + discount)

**Files:**
- Create: `src/server/services/invoice-review.ts`
- Test: `src/test/invoice-review.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  checkMissingInfo,
  checkSuspiciousDiscount,
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
    snap.total = 1000;
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/invoice-review.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

```ts
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
      fields: ["client.address"],
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/invoice-review.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/invoice-review.ts src/test/invoice-review.test.ts
git commit -m "feat(ai-review): invoice snapshot types + missing-info & discount checks"
```

---

## Task 4: Deterministic review checks (unbilled time + duplicate risk)

**Files:**
- Modify: `src/server/services/invoice-review.ts`
- Modify: `src/test/invoice-review.test.ts`

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
import { checkUnbilledTime, checkDuplicateRisk } from "@/server/services/invoice-review";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/invoice-review.test.ts`
Expected: FAIL — `checkUnbilledTime` / `checkDuplicateRisk` not exported.

- [ ] **Step 3: Write the minimal implementation (append to `invoice-review.ts`)**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/invoice-review.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/invoice-review.ts src/test/invoice-review.test.ts
git commit -m "feat(ai-review): unbilled-time and duplicate-invoice-risk checks"
```

---

## Task 5: Unclear-description LLM check + grounding guard + aggregator

**Files:**
- Modify: `src/server/services/invoice-review.ts`
- Modify: `src/test/invoice-review.test.ts`

- [ ] **Step 1: Write the failing test for the grounding guard + aggregator**

```ts
import {
  guardUnclearDescriptionFlags,
  runDeterministicChecks,
} from "@/server/services/invoice-review";

describe("guardUnclearDescriptionFlags", () => {
  it("keeps only flags whose lineId exists on the invoice", () => {
    const snap = baseSnapshot(); // has line "l1"
    const guarded = guardUnclearDescriptionFlags(snap, [
      { lineId: "l1", reason: "vague" },
      { lineId: "ghost", reason: "fabricated line" },
    ]);
    expect(guarded.map((f) => f.fields[0])).toEqual(["line:l1"]);
  });
});

describe("runDeterministicChecks", () => {
  it("aggregates all deterministic findings", () => {
    const snap = baseSnapshot();
    snap.client.address = null;
    snap.discountTotal = 400;
    snap.total = 600;
    const codes = runDeterministicChecks(snap).map((f) => f.code);
    expect(codes).toContain("missing_client_address");
    expect(codes).toContain("suspicious_invoice_discount");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/invoice-review.test.ts`
Expected: FAIL — symbols not exported.

- [ ] **Step 3: Write the minimal implementation (append to `invoice-review.ts`)**

```ts
import { z } from "zod";
import { env } from "@/lib/env";
import { callGeminiWithModelFallback, resolveGeminiModels } from "./gemini-fallback";
import { extractGeminiText } from "./natural-language-invoice";
import { parseValidatedJson, AiOutputError } from "./ai-structured-output";

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
    if (err instanceof AiOutputError) return [];
    // A provider/network failure should never block sending — degrade to no AI findings.
    return [];
  }
}

/** Full review: deterministic checks always, LLM unclear-description best-effort. */
export async function reviewInvoice(snap: InvoiceReviewSnapshot): Promise<ReviewFinding[]> {
  const [unclear] = await Promise.all([checkUnclearDescriptions(snap)]);
  return [...runDeterministicChecks(snap), ...unclear];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/invoice-review.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/invoice-review.ts src/test/invoice-review.test.ts
git commit -m "feat(ai-review): unclear-description LLM pass with grounding guard + aggregator"
```

---

## Task 6: tRPC router (org-scoped snapshot loader + review query)

**Files:**
- Create: `src/server/routers/invoiceReview.ts`
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Write the router**

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";
import {
  reviewInvoice,
  type InvoiceReviewSnapshot,
  type RecentInvoiceSignature,
} from "@/server/services/invoice-review";

const DUPLICATE_WINDOW_DAYS = 30;

export const invoiceReviewRouter = router({
  /**
   * Advisory pre-send review for one invoice. Read-only: never mutates, never
   * blocks sending. Every query is scoped to ctx.orgId so no cross-tenant data
   * can enter the snapshot or the LLM prompt.
   */
  review: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        include: {
          client: true,
          lines: true,
          organization: { select: { stripeTaxEnabled: true } },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86400000);
      const recent = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          clientId: invoice.clientId,
          id: { not: invoice.id },
          isArchived: false,
          createdAt: { gte: windowStart },
        },
        select: { id: true, number: true, total: true, createdAt: true, lines: { select: { name: true } } },
        take: 25,
      });

      // Unbilled time = TimeEntry rows for this client's projects not yet on any line.
      const unbilled = await ctx.db.timeEntry.aggregate({
        _sum: { minutes: true },
        where: {
          organizationId: ctx.orgId,
          invoiceLineId: null,
          project: { clientId: invoice.clientId },
        },
      });

      const recentInvoices: RecentInvoiceSignature[] = recent.map((r) => ({
        id: r.id,
        number: r.number,
        total: Number(r.total),
        createdAt: r.createdAt,
        lineNames: r.lines.map((l) => l.name),
      }));

      const snapshot: InvoiceReviewSnapshot = {
        invoiceId: invoice.id,
        organizationId: invoice.organizationId,
        total: Number(invoice.total),
        discountTotal: Number(invoice.discountTotal),
        client: {
          id: invoice.client.id,
          name: invoice.client.name,
          address: invoice.client.address,
          city: invoice.client.city,
          country: invoice.client.country,
          taxId: invoice.client.taxId,
          isTaxExempt: invoice.client.isTaxExempt,
        },
        orgHasTaxConfigured: invoice.organization.stripeTaxEnabled,
        lines: invoice.lines.map((l) => ({
          id: l.id,
          name: l.name,
          description: l.description,
          total: Number(l.total),
          discount: Number(l.discount),
          discountIsPercentage: l.discountIsPercentage,
        })),
        unbilledMinutes: Number(unbilled._sum.minutes ?? 0),
        recentInvoices,
      };

      const findings = await reviewInvoice(snapshot);
      return { findings };
    }),
});
```

> **Note for implementer:** confirm the org tax flag field name on `Organization` (the schema references `stripeTaxEnabled` in the Invoice comments). If the real field differs, set `orgHasTaxConfigured` from the correct field — do not invent one. Run `grep -n "stripeTaxEnabled\|taxEnabled\|defaultTax" prisma/schema.prisma` before writing.

- [ ] **Step 2: Register the router in `_app.ts`**

Add the import alongside the others:

```ts
import { invoiceReviewRouter } from "./invoiceReview";
```

Add to the `appRouter` object (near the `invoices:` entry):

```ts
  invoiceReview: invoiceReviewRouter,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any field-name mismatches surfaced against the real Prisma client.

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/invoiceReview.ts src/server/routers/_app.ts
git commit -m "feat(ai-review): org-scoped invoiceReview.review tRPC query"
```

---

## Task 7: Golden-set eval suite (deterministic checks + cross-tenant + grounding)

**Files:**
- Create: `src/server/services/ai-eval/fixtures/invoice-review.fixtures.ts`
- Modify: `src/server/services/ai-eval/graders.ts`
- Modify: `src/server/services/ai-eval/index.ts`
- Create: `src/test/ai-eval/invoice-review.eval.test.ts`

- [ ] **Step 1: Write the grader (append to `graders.ts`)**

```ts
import {
  runDeterministicChecks,
  guardUnclearDescriptionFlags,
  type InvoiceReviewSnapshot,
  type UnclearDescriptionFlag,
} from "../invoice-review";

export interface InvoiceReviewInput {
  snapshot: InvoiceReviewSnapshot;
  /** Raw flags a model "returned" — graded through the grounding guard. */
  modelFlags?: UnclearDescriptionFlag[];
}

export interface InvoiceReviewExpected {
  /** Deterministic finding codes that must appear. */
  expectCodes?: string[];
  /** Finding codes that must NOT appear. */
  forbidCodes?: string[];
  /** After grounding, unclear-description flags must point only at these lineIds. */
  expectGroundedLineIds?: string[];
}

export const gradeInvoiceReview: Grader<InvoiceReviewInput, InvoiceReviewExpected> = (
  input,
  expected,
) => {
  const codes = runDeterministicChecks(input.snapshot).map((f) => f.code);
  const grounded = guardUnclearDescriptionFlags(input.snapshot, input.modelFlags ?? []);
  const groundedIds = grounded.map((f) => f.fields[0].replace("line:", ""));

  const checks: Array<{ ok: boolean; label: string }> = [];
  for (const code of expected.expectCodes ?? []) {
    const ok = codes.includes(code);
    checks.push({ ok, label: ok ? "" : `missing finding ${code}` });
  }
  for (const code of expected.forbidCodes ?? []) {
    const ok = !codes.includes(code);
    checks.push({ ok, label: ok ? "" : `unexpected finding ${code}` });
  }
  if (expected.expectGroundedLineIds) {
    const ok =
      groundedIds.length === expected.expectGroundedLineIds.length &&
      expected.expectGroundedLineIds.every((id) => groundedIds.includes(id));
    checks.push({ ok, label: ok ? "" : `grounded ids ${groundedIds.join(",")} want ${expected.expectGroundedLineIds.join(",")}` });
  }

  const total = checks.length;
  const correct = checks.filter((c) => c.ok).length;
  const misses = checks.filter((c) => !c.ok).map((c) => c.label);
  return { score: total === 0 ? 1 : correct / total, detail: misses.length ? misses.join("; ") : undefined };
};
```

- [ ] **Step 2: Write the fixtures**

```ts
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
```

> **Cross-tenant note:** the snapshot loader in Task 6 is the org-isolation boundary (every query filtered by `ctx.orgId`); this grader operates on an already-scoped snapshot. The pure eval harness CANNOT test org-scoping (graders make no DB calls) — that invariant is proven by the router test in **Task 8** below. The `grounding-drops-fabricated-line` critical case here guards only the LLM-output boundary, which is a different invariant.

- [ ] **Step 3: Register the suite in `index.ts`**

Add imports:

```ts
import { gradeInvoiceReview } from "./graders";
import { invoiceReviewCases } from "./fixtures/invoice-review.fixtures";
```

Add to the `suites` array in `runAllEvalSuites()`:

```ts
    {
      // Deterministic review checks + the unclear-description grounding guard
      // (critical) must hold exactly — they gate the pre-send advisory.
      report: runSuite("invoice-review", invoiceReviewCases, gradeInvoiceReview),
      gate: { minScore: 1, minPassRate: 1 },
    },
```

Add to the re-export block:

```ts
  gradeInvoiceReview,
  type InvoiceReviewInput,
  type InvoiceReviewExpected,
```

- [ ] **Step 4: Write the CI gate test**

```ts
import { describe, it, expect } from "vitest";
import { gradeInvoiceReview } from "@/server/services/ai-eval";
import { invoiceReviewCases } from "@/server/services/ai-eval/fixtures/invoice-review.fixtures";

describe("golden: invoice review checks", () => {
  it.each(invoiceReviewCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeInvoiceReview(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
```

- [ ] **Step 5: Run the eval suite**

Run: `npx vitest run src/test/ai-eval/invoice-review.eval.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ai-eval/ src/test/ai-eval/invoice-review.eval.test.ts
git commit -m "test(ai-review): golden-set eval suite for invoice review checks"
```

---

## Task 8: Cross-tenant isolation router test (named invariant)

The spec names cross-tenant isolation a first-class invariant with a per-feature test. The pure eval suite (Task 7) cannot cover it — graders make no DB calls. This mock-based router test proves `review` only ever queries the caller's org and returns `NOT_FOUND` for another org's invoice. Pattern mirrors `src/test/routers-hours-retainers.test.ts`.

**Files:**
- Create: `src/test/invoiceReview.router.test.ts`

- [ ] **Step 1: Confirm the mock context + which models it mocks**

Run: `grep -nE "orgId|userRole|invoice:|timeEntry:|organization:" src/test/mocks/prisma.ts | head`
Expected: `createMockContext()` returns `orgId: "test-org-123"`, `userRole: "OWNER"` (so `requireRole` passes), and `db.invoice.findFirst/findMany`, `db.timeEntry.aggregate`, `db.organization` are mocked. If `db.timeEntry.aggregate` or any model used by the router is missing from the mock, add the `vi.fn()` to `src/test/mocks/prisma.ts` in this step.

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { invoiceReviewRouter } from "@/server/routers/invoiceReview";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("invoiceReview.review — multi-tenant isolation", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = invoiceReviewRouter.createCaller(ctx);
  });

  it("scopes the invoice lookup to the caller's org", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue(null); // another org's invoice is invisible
    await expect(caller.review({ invoiceId: "other-org-invoice" })).rejects.toThrow(TRPCError);
    const where = ctx.db.invoice.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
    expect(where.id).toBe("other-org-invoice");
  });

  it("scopes the duplicate-detection and unbilled-time queries to the caller's org", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "inv1",
      organizationId: "test-org-123",
      total: 100,
      discountTotal: 0,
      clientId: "c1",
      client: { id: "c1", name: "Acme", address: "1 St", city: "Town", country: "US", taxId: "T1", isTaxExempt: false },
      lines: [],
      organization: { stripeTaxEnabled: false },
    });
    ctx.db.invoice.findMany.mockResolvedValue([]);
    ctx.db.timeEntry.aggregate.mockResolvedValue({ _sum: { minutes: null } });

    await caller.review({ invoiceId: "inv1" });

    expect(ctx.db.invoice.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.timeEntry.aggregate.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});
```

> **Implementer note:** match the mocked invoice shape to the actual `include`/`select` in the Task 6 router (client fields, `organization.stripeTaxEnabled` or the real field name). If you changed `orgHasTaxConfigured`'s source field in Task 6, update the mock here to match.

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/test/invoiceReview.router.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/test/invoiceReview.router.test.ts src/test/mocks/prisma.ts
git commit -m "test(ai-review): cross-tenant isolation router test for invoiceReview.review"
```

---

## Task 9: Pre-send review panel UI

**Files:**
- Create: `src/components/invoices/InvoiceReviewPanel.tsx`
- Modify: the invoice detail/send component that renders the Send action (locate via grep; do not guess).

- [ ] **Step 1: Locate the send action**

Run: `grep -rn "invoices.send\b\|previewEmail\|Send invoice\|onSend" src/components/invoices | head`
Expected: identifies the component that triggers `invoices.send`. Note its path for Step 3.

- [ ] **Step 2: Write the panel component**

```tsx
"use client";

import { trpc } from "@/trpc/client";

const SEVERITY_STYLES: Record<string, string> = {
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
};

export function InvoiceReviewPanel({ invoiceId }: { invoiceId: string }) {
  const review = trpc.invoiceReview.review.useMutation();

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        onClick={() => review.mutate({ invoiceId })}
        disabled={review.isPending}
      >
        {review.isPending ? "Reviewing…" : "AI review before send"}
      </button>

      {review.data && review.data.findings.length === 0 && (
        <p className="text-sm text-emerald-700">No issues found — this invoice looks ready to send.</p>
      )}

      {review.data && review.data.findings.length > 0 && (
        <ul className="space-y-2">
          {review.data.findings.map((f, i) => (
            <li
              key={`${f.code}-${i}`}
              className={`rounded-md border px-3 py-2 text-sm ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info}`}
            >
              {f.message}
            </li>
          ))}
        </ul>
      )}

      {review.error && (
        <p className="text-sm text-red-600">Couldn’t run the review. You can still send.</p>
      )}
    </div>
  );
}
```

> **Note for implementer:** confirm the tRPC client import path used elsewhere in `src/components/invoices/` (e.g. `@/trpc/client` vs `@/lib/trpc`) with `grep -rn "useMutation\|trpc" src/components/invoices | head` and match it exactly.

- [ ] **Step 3: Mount the panel near the Send action**

In the component identified in Step 1, render `<InvoiceReviewPanel invoiceId={invoice.id} />` above the Send button. Keep it advisory — do not gate the Send button on the review result.

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/invoices/InvoiceReviewPanel.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/invoices/InvoiceReviewPanel.tsx <the modified send component>
git commit -m "feat(ai-review): pre-send invoice review panel"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: all green, including the new `invoice-review` golden suite and the deterministic unit tests.

- [ ] **Run the AI eval gate (if a script exists)**

Run: `npx tsx scripts/ai-eval.ts` (skip if the script is absent)
Expected: `invoice-review` suite reports score 100% / pass 4/4, no critical failures.

---

## Self-Review (completed by plan author)

- **Spec coverage:** All five reviewer checks from the spec are implemented (missing tax/address → `checkMissingInfo`; suspicious discounts → `checkSuspiciousDiscount`; unbilled time → `checkUnbilledTime`; duplicate risk → `checkDuplicateRisk`; unclear descriptions → `checkUnclearDescriptions`). Gemini-first provider, shared structured-output validation, and full eval coverage are all present. The named **cross-tenant invariant** is tested at the router layer in **Task 8** (the pure eval harness structurally cannot test org-scoping — it makes no DB calls).
- **Type consistency:** `ReviewFinding`, `InvoiceReviewSnapshot`, `UnclearDescriptionFlag` names are used identically across service, router, grader, and fixtures. `fields: ["line:<id>"]` encoding is consistent between `guardUnclearDescriptionFlags` and the grader's `replace("line:", "")`.
- **Open items deliberately left to the implementer (with grep instructions, not placeholders):** the exact `Organization` tax-config field name, the tRPC client import path, and the send-action component location — each has an explicit `grep` to resolve before writing.

## Remaining features (separate plans, same release)

Plan 2 — Expense categorization (extends `expensesRouter`).
Plan 3 — Collections copilot (`collections.queue` + `/collections` UI over the existing stack).
Plan 4 — Proposal generator (extends `proposalsRouter`).

Each reuses the Task 1–2 scaffold (env-var convention + `ai-structured-output.ts`) and the eval-harness extension pattern from Task 7.

# Manual Payment Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "unmatched payments" inbox: record money received off-platform (check/Zelle/ACH/Venmo/wire/cash), then match it against one or more open invoices with correct PAID/PARTIALLY_PAID status transitions and a full audit trail.

**Architecture:** New `UnmatchedPayment` staging model + new `paymentReconciliation` tRPC router + one new page (`/reconciliation`). Matching creates standard `Payment` rows (linked back via a new nullable `unmatchedPaymentId` FK), fires the existing `invoice/payment.received` Inngest event, sends the existing receipt email, and uses a NEW balance-aware status helper (`applyPaymentStatus`) so an underpayment lands on `PARTIALLY_PAID`, not `PAID`. Existing `markPaid`/`markPaidMany` behavior is NOT changed (except additive audit logging). Migration is purely additive (1 new table, 1 nullable column, 1 new enum).

**Tech Stack:** Prisma 7, tRPC v11 (`requireRole` pattern), Zod 4, existing `logAudit`, `sendPaymentReceiptEmail`, Inngest event `invoice/payment.received`.

**Hard constraints:**
- Migration must be additive-only: no altering/dropping existing columns, no enum value changes on existing enums.
- Do NOT change `markPaid`'s status semantics (it always sets PAID today — leave that).
- All queries org-scoped via `ctx.orgId` like every other router.
- `Payment.method` is a free-form String — no enum migration for methods.

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [x] **Step 1:** Add enum + model (place near `Payment`, ~line 848):

```prisma
enum UnmatchedPaymentStatus {
  UNMATCHED
  PARTIALLY_MATCHED
  MATCHED
  IGNORED
}

model UnmatchedPayment {
  id             String                 @id @default(cuid())
  organizationId String
  organization   Organization           @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  amount         Decimal                @db.Decimal(12, 2)
  matchedAmount  Decimal                @default(0) @db.Decimal(12, 2)
  method         String // "check" | "zelle" | "ach" | "venmo" | "wire" | "cash" | "other"
  reference      String? // check number, memo line, transfer note
  payerName      String?
  notes          String?
  receivedAt     DateTime               @default(now())
  status         UnmatchedPaymentStatus @default(UNMATCHED)
  matchedAt      DateTime?
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt
  payments       Payment[]

  @@index([organizationId, status])
  @@index([organizationId, receivedAt])
}
```

- [x] **Step 2:** On `model Payment`, add the back-relation (nullable FK, additive):

```prisma
  unmatchedPaymentId String?
  unmatchedPayment   UnmatchedPayment? @relation(fields: [unmatchedPaymentId], references: [id], onDelete: SetNull)
```

And on `model Organization`, add `unmatchedPayments UnmatchedPayment[]` alongside its other relation arrays.

- [x] **Step 3:** Run: `npx prisma migrate dev --name unmatched_payments` (if a live DB is unavailable in the sandbox, run `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma` is NOT equivalent — instead create the migration SQL with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/$(date +%Y%m%d%H%M%S)_unmatched_payments/migration.sql` after `mkdir -p` of that dir; verify the SQL only contains `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE "Payment" ADD COLUMN`, and `CREATE INDEX` statements).
- [x] **Step 4:** Run: `npx prisma generate` → success.
- [x] **Step 5:** Commit schema + migration.

### Task 2: Balance-aware status helper

**Files:**
- Create: `src/server/services/invoice-balance.ts`
- Test: `src/test/invoice-balance.test.ts`

- [x] **Step 1:** Write failing tests covering: underpayment → PARTIALLY_PAID; exact → PAID; overpay → PAID; credit-note applications reduce balance; already-paid sum counts prior payments.

```ts
import { describe, expect, it } from "vitest";
import { resolvePaymentStatus } from "@/server/services/invoice-balance";

describe("resolvePaymentStatus", () => {
  it("returns PARTIALLY_PAID when payments cover less than total", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 40, creditApplied: 0 }),
    ).toBe("PARTIALLY_PAID");
  });
  it("returns PAID when payments cover the total exactly", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 100, creditApplied: 0 }),
    ).toBe("PAID");
  });
  it("returns PAID on overpayment", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 120, creditApplied: 0 }),
    ).toBe("PAID");
  });
  it("counts credit-note applications toward the balance", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 60, creditApplied: 40 }),
    ).toBe("PAID");
  });
  it("tolerates floating-point residue under a cent", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 99.999, creditApplied: 0 }),
    ).toBe("PAID");
  });
});
```

- [x] **Step 2:** Run test → FAIL (module not found).
- [x] **Step 3:** Implement:

```ts
import type { InvoiceStatus } from "@/generated/prisma"; // match the import path other services use for Prisma enums — check e.g. src/server/services/audit.ts and mirror it

const EPSILON = 0.005; // half a cent

export function resolvePaymentStatus(args: {
  total: number;
  paymentsSum: number;
  creditApplied: number;
}): Extract<InvoiceStatus, "PAID" | "PARTIALLY_PAID"> {
  const balance = args.total - args.paymentsSum - args.creditApplied;
  return balance <= EPSILON ? "PAID" : "PARTIALLY_PAID";
}
```

(If the generated Prisma enum import path differs, mirror whatever `src/server/routers/invoices.ts` uses for `InvoiceStatus`.)

- [x] **Step 4:** Run test → PASS. Commit.

### Task 3: paymentReconciliation router

**Files:**
- Create: `src/server/routers/paymentReconciliation.ts`
- Modify: `src/server/routers/_app.ts` (register `paymentReconciliation: paymentReconciliationRouter`)
- Test: `src/test/routers-payment-reconciliation.test.ts`

Follow the structure/mocking style of `src/test/routers-invoices-procedures.test.ts:781-830` (mocked `ctx.db`, `$transaction` passthrough).

Procedures (all org-scoped; mutations `requireRole("OWNER","ADMIN")`, reads `protectedProcedure`):

- `list` — input `{ status?: UnmatchedPaymentStatus[] }` default `["UNMATCHED","PARTIALLY_MATCHED"]`; returns rows ordered by `receivedAt desc`.
- `create` — input:

```ts
z.object({
  amount: z.number().positive(),
  method: z.enum(["check", "zelle", "ach", "venmo", "wire", "cash", "other"]),
  reference: z.string().max(200).optional(),
  payerName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  receivedAt: z.coerce.date().optional(),
})
```

  Creates the row; `logAudit({ action: "CREATE", entityType: "UnmatchedPayment", ... })` (use an existing `AuditAction` value — check `src/server/services/audit.ts` / the Prisma `AuditAction` enum and pick the closest existing values; do NOT add new enum values to existing enums).
- `ignore` — input `{ id }`; only allowed from `UNMATCHED` (throw `TRPCError PRECONDITION_FAILED` otherwise); sets `IGNORED`; audit-log it.
- `unignore` — input `{ id }`; `IGNORED` → `UNMATCHED`.
- `match` — the core mutation. Input:

```ts
z.object({
  id: z.string(),
  applications: z
    .array(z.object({ invoiceId: z.string(), amount: z.number().positive() }))
    .min(1)
    .max(20),
})
```

  Inside one `$transaction`:
  1. Load the UnmatchedPayment (org-scoped, `FOR UPDATE` semantics come free from the transaction + status recheck); reject if status `MATCHED`/`IGNORED` or if `sum(applications.amount) > amount - matchedAmount` (+EPSILON) → `TRPCError BAD_REQUEST`.
  2. For each application: load invoice org-scoped with `payments` and `creditNotesReceived`; reject if invoice status not in `SENT | PARTIALLY_PAID | OVERDUE` → `BAD_REQUEST` with the invoice number in the message.
  3. Create a `Payment` row per application: `{ amount, method: unmatched.method, transactionId: unmatched.reference ?? undefined, notes, paidAt: unmatched.receivedAt, unmatchedPaymentId: unmatched.id }`.
  4. Compute new status via `resolvePaymentStatus` (paymentsSum = existing payments + this application; creditApplied = sum of `CreditNoteApplication.amount` targeting this invoice) and update the invoice.
  5. Update the UnmatchedPayment: `matchedAmount += sum`, status = fully allocated (within EPSILON) ? `MATCHED` : `PARTIALLY_MATCHED`, `matchedAt = new Date()` when MATCHED.
  After the transaction (mirror `markPaid`'s post-transaction block in `src/server/routers/invoices.ts:1343-1413`): per matched invoice, fire `inngest.send({ name: "invoice/payment.received", data: { invoiceId, trigger: "PAYMENT_RECEIVED" } })` and `sendPaymentReceiptEmail(...)`, each `.catch`-guarded exactly like `markPaid` does; `logAudit` per invoice with `action: "PAYMENT_RECEIVED"`-equivalent existing enum value, `.catch(() => {})`-wrapped.
- `openInvoices` — read helper for the match picker: input `{ search?: string, clientId?: string }`; returns invoices with status `in [SENT, PARTIALLY_PAID, OVERDUE]`, `isArchived: false`, including `client` and computed `balance` (total − paymentsSum − creditApplied), ordered by `dueDate asc`, limit 50. Reuse the query shape from `reportsRouter.unpaidInvoices` (`src/server/routers/reports.ts:39-67`).

- [x] **Step 1:** Write failing router tests: create → row created with UNMATCHED; match happy path (2 invoices, exact allocation → payments created, invoice statuses PAID, unmatched MATCHED); partial allocation → PARTIALLY_MATCHED + invoice PARTIALLY_PAID when underpaid; over-allocation rejected; matching an IGNORED/MATCHED row rejected; cross-org invoice rejected (invoice lookup returns null → error); ignore/unignore transitions.
- [x] **Step 2:** Run → FAIL. **Step 3:** Implement router + register in `_app.ts`. **Step 4:** Run → PASS. **Step 5:** Commit.

### Task 4: Reconciliation page UI

**Files:**
- Create: `src/app/(dashboard)/reconciliation/page.tsx` (mirror the route-group/layout pattern of the `/collections` page — check `src/app/**/collections/page.tsx` and copy its shell: page header, loading/empty states)
- Create: `src/components/reconciliation/UnmatchedPaymentsList.tsx`
- Create: `src/components/reconciliation/AddUnmatchedPaymentDialog.tsx`
- Create: `src/components/reconciliation/MatchPaymentDialog.tsx`
- Modify: `src/components/layout/SidebarNav.tsx` (add `{ href: "/reconciliation", label: "Reconciliation", icon: <appropriate lucide icon, e.g. GitMerge or Landmark> }` to `secondaryNav` near `/collections`)

Behavior:
- List shows UNMATCHED + PARTIALLY_MATCHED rows (amount, remaining = amount − matchedAmount, method badge, payer, reference, receivedAt) with actions Match / Ignore; a toggle reveals IGNORED and MATCHED history.
- AddUnmatchedPaymentDialog: fields amount, method (select: Check/Zelle/ACH/Venmo/Wire/Cash/Other), received date (default today), payer name, reference, notes. Client-side Zod mirror of the server schema; toast on success (follow whatever toast pattern `RecordPaymentDialog.tsx` uses).
- MatchPaymentDialog: shows the payment's remaining amount; searchable open-invoice list from `paymentReconciliation.openInvoices` (search box filters by invoice number/client); selecting invoices adds allocation rows with editable amounts, prefilled to `min(invoice balance, remaining unallocated)`; footer shows allocated vs remaining; Match button disabled while over-allocated; on success invalidate `paymentReconciliation.list` and `invoices` queries.
- Use existing UI primitives (whatever `RecordPaymentDialog.tsx` imports — dialog, button, input, select components) and existing currency-formatting helpers (grep for how `RecordPaymentDialog` formats amounts).

- [x] **Step 1:** Build components. **Step 2:** `npx tsc --noEmit` → 0 errors. **Step 3:** Component test for MatchPaymentDialog allocation math if a component-test pattern exists (check `src/test/**/*.test.tsx` for a dialog test to mirror; if none fits, cover the allocation-prefill logic as a pure function in `src/components/reconciliation/allocation.ts` + `src/test/reconciliation-allocation.test.ts`):

```ts
// allocation.ts
export function prefillAllocation(invoiceBalance: number, unallocated: number): number {
  return Math.max(0, Math.min(invoiceBalance, unallocated));
}
```

- [x] **Step 4:** Commit.

### Task 5: Method dropdown parity + audit-log hardening (small, additive)

**Files:**
- Modify: `src/components/invoices/RecordPaymentDialog.tsx` (method dropdown: add `zelle`, `ach`, `venmo` options alongside existing ones)
- Modify: `src/server/routers/invoices.ts` (`markPaid` ~line 1343-1413 and `markPaidMany` ~line 1095-1200: add a `.catch(() => {})`-wrapped `logAudit` call after the transaction, mirroring `partialPayments.ts:99-110`; do NOT change any other behavior)
- Test: extend `src/test/routers-invoices-procedures.test.ts` `markPaid` describe with one test asserting `logAudit` is called (mock `@/server/services/audit`).

- [x] Steps: failing test → implement → pass → commit.

### Task 6: Full verification

- [x] **Step 1:** `npm test -- --no-file-parallelism` (full suite; if the sandbox blocks it, run the targeted files: `invoice-balance`, `routers-payment-reconciliation`, `reconciliation-allocation`, `routers-invoices-procedures`, and note that the coordinator will run the full suite outside).
- [x] **Step 2:** `npx tsc --noEmit` → 0 errors.
- [x] **Step 3:** `npm run lint` → 0 errors.
- [x] **Step 4:** Commit anything pending. If any commit fails with sandbox `.git` errors, leave files staged and list exact `git add` commands per pending commit; continue regardless.

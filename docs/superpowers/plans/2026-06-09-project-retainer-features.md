# Project & Retainer Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Change Orders, a Retainer Burn-down dashboard, Project Health scoring, and a Utilization report to the existing Next.js 16 / tRPC v11 / Prisma invoicing app.

**Architecture:** Three of the four features are read-only analytics built as **pure scoring/aggregation functions** in `src/server/services/*` (unit-tested without a DB) fed by data-builders and exposed via tRPC `protectedProcedure`s, then rendered by server-component report pages — mirroring the existing `client-health-score.ts` + `analytics-data.ts` + `/reports/*` pattern. Change Orders reuse the existing Estimate (`Invoice` type=ESTIMATE) machinery: the portal e-signature approval (`portal.signProposal`) and `invoices.convertEstimateToInvoice` already exist; we add a `projectId` + `isChangeOrder` marker and a thin create wrapper.

**Tech Stack:** Next.js 16 App Router (server components), tRPC v11, Prisma 7 (PostgreSQL), Zod 4, Vitest, Tailwind v4 + shadcn/ui, lucide-react.

**Reference files to mirror (read before starting):**
- Scoring service + test: `src/server/services/client-health-score.ts`, `src/test/client-health-score.test.ts`
- Data builder: `src/server/services/analytics-data.ts` (`buildClientHealthInputs`)
- Report page: `src/app/(dashboard)/reports/time/page.tsx`; reports index: `src/app/(dashboard)/reports/page.tsx`
- Router proc tests: `src/test/routers-reports-procedures.test.ts`; mock ctx: `src/test/mocks/trpc-context.ts`
- Invoice create/convert + cross-tenant guard: `src/server/routers/invoices.ts` (`create` @362, `convertEstimateToInvoice` @667, `assertInOrg` from `src/server/lib/get-for-org.ts`)
- Project detail page + tabs: `src/app/(dashboard)/projects/[id]/page.tsx`; badge pattern: `src/components/clients/ClientHealthBadge.tsx`

**Conventions:** `Decimal` columns come back as Prisma `Decimal` — convert with `.toNumber()` at the data-builder boundary so pure functions take plain `number`s. All DB reads/writes carry `organizationId: ctx.orgId`. Validate caller-supplied foreign ids with `assertInOrg`. Commit after each task.

---

## Milestone 1 — Change Orders

### Task 1: Schema — link invoices to projects + mark change orders

**Files:**
- Modify: `prisma/schema.prisma` (`Invoice` model ~518-615, `Project` model ~828-854)
- Create (generated): a migration under `prisma/migrations/`

- [ ] **Step 1: Add fields to the `Invoice` model**

In `prisma/schema.prisma`, inside `model Invoice`, add near the `clientId`/`organizationId` block:
```prisma
  projectId      String?
  project        Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  isChangeOrder  Boolean   @default(false)
```
And add to the `Invoice` index block at the bottom of the model:
```prisma
  @@index([organizationId, projectId])
```

- [ ] **Step 2: Add the back-relation to `Project`**

In `model Project`, alongside the other relation lists (e.g. after `timeEntries  TimeEntry[]`):
```prisma
  invoices            Invoice[]
```

- [ ] **Step 3: Generate the migration + client**

Run: `npx prisma migrate dev --name invoice_project_change_order`
Expected: a new migration adds a nullable `projectId` column, a `isChangeOrder` boolean default false, an index, and a FK with `ON DELETE SET NULL`. `prisma generate` runs automatically.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no usages reference the new fields yet, so this only proves the schema/client compile).

- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(change-orders): add Invoice.projectId + isChangeOrder schema"
```

---

### Task 2: `invoices.createChangeOrder` + carry `projectId` through create/list

**Files:**
- Modify: `src/server/routers/invoices.ts` (schemas ~58-74, `create` ~362, `convertEstimateToInvoice` ~667, `list` ~127)
- Test: `src/test/routers-invoices-change-orders.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/test/routers-invoices-change-orders.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceType } from "@/generated/prisma";

describe("invoices.createChangeOrder", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  it("rejects a project from another tenant", async () => {
    ctx.db.project.findFirst.mockResolvedValue(null); // assertInOrg → NOT_FOUND
    await expect(
      caller.createChangeOrder({
        projectId: "proj_other",
        lines: [{ sort: 0, name: "Extra page", qty: 1, rate: 500, taxIds: [] }],
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("creates an ESTIMATE flagged as a change order, inheriting client + currency from the project", async () => {
    ctx.db.project.findFirst.mockResolvedValue({
      id: "proj_1",
      organizationId: "test-org-123",
      clientId: "client_1",
      currencyId: "cur_1",
    });
    ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123", stripeTaxEnabled: false });
    ctx.db.client.findFirst.mockResolvedValue({ id: "client_1", organizationId: "test-org-123" });
    // $transaction(cb) just runs the callback with the same db mock
    ctx.db.$transaction.mockImplementation(async (cb: any) => cb(ctx.db));
    ctx.db.invoice.count.mockResolvedValue(0); // for invoice numbering
    ctx.db.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv_co", ...data }));

    const result = await caller.createChangeOrder({
      projectId: "proj_1",
      lines: [{ sort: 0, name: "Extra page", qty: 1, rate: 500, taxIds: [] }],
    });

    const created = ctx.db.invoice.create.mock.calls[0][0].data;
    expect(created.type).toBe(InvoiceType.ESTIMATE);
    expect(created.isChangeOrder).toBe(true);
    expect(created.projectId).toBe("proj_1");
    expect(created.clientId).toBe("client_1");
    expect(created.currencyId).toBe("cur_1");
    expect(result.id).toBe("inv_co");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- routers-invoices-change-orders`
Expected: FAIL — `caller.createChangeOrder is not a function`.

- [ ] **Step 3: Thread `projectId` through the existing write schema + create/convert**

In `src/server/routers/invoices.ts`, add `projectId` to `invoiceWriteSchema` (after `clientId`):
```ts
  projectId: z.string().nullable().optional(),
```
In the `create` mutation's `tx.invoice.create({ data: { ... } })`, add (next to `clientId`):
```ts
            projectId: input.projectId ?? null,
```
In `convertEstimateToInvoice`'s `tx.invoice.create({ data: { ... } })`, carry the source link so a converted change order stays attributable:
```ts
            projectId: source.projectId,
            isChangeOrder: false,
```
(Add `projectId: true, isChangeOrder: true` is not needed — `findUnique` without `select` returns scalars including `projectId`.)

- [ ] **Step 4: Add the `createChangeOrder` mutation**

Add to the `invoicesRouter` (place after `create`):
```ts
  createChangeOrder: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        projectId: z.string().min(1),
        date: z.coerce.date().default(() => new Date()),
        notes: z.string().optional(),
        lines: z.array(lineSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Cross-tenant guard (parity with create's client check, commit f7f22b1).
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, organizationId: ctx.orgId },
        select: { id: true, clientId: true, currencyId: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: {
          id: true, stripeTaxEnabled: true, addressLine1: true, addressLine2: true,
          city: true, state: true, postalCode: true, country: true,
        },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);
      const resolved = await resolveInvoiceTax({
        db: ctx.db as unknown as PrismaClient,
        org,
        clientId: project.clientId,
        currencyId: project.currencyId,
        lines: input.lines.map(toResolverLine),
        discountType: null,
        discountAmount: 0,
        taxMap,
      });

      const invoice = await ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateInvoiceNumber(txClient, ctx.orgId);
        return tx.invoice.create({
          data: {
            number,
            type: InvoiceType.ESTIMATE,
            status: InvoiceStatus.DRAFT,
            isChangeOrder: true,
            date: input.date,
            notes: input.notes,
            clientId: project.clientId,
            projectId: project.id,
            currencyId: project.currencyId,
            organizationId: ctx.orgId,
            portalToken: generatePortalToken(),
            subtotal: resolved.invoice.subtotal,
            discountTotal: resolved.invoice.discountTotal,
            taxTotal: resolved.invoice.taxTotal,
            total: resolved.invoice.total,
            stripeTaxCalculationId: resolved.invoice.stripeTaxCalculationId,
            lines: {
              create: input.lines.map((line, i) => {
                const r = resolved.lines[i];
                return {
                  sort: line.sort, lineType: line.lineType, name: line.name,
                  description: line.description, qty: line.qty, rate: line.rate,
                  period: line.period, discount: line.discount,
                  discountIsPercentage: line.discountIsPercentage,
                  sourceTable: line.sourceTable, sourceId: line.sourceId,
                  subtotal: r.subtotal, taxTotal: r.taxTotal, total: r.total,
                  taxes: { create: r.legacyTaxBreakdown },
                  stripeTaxBreakdown: { create: r.stripeTaxBreakdown },
                };
              }),
            },
          },
          include: detailInvoiceInclude,
        });
      });

      await logAudit({
        action: "CREATED", entityType: "Invoice", entityId: invoice.id,
        entityLabel: invoice.number, organizationId: ctx.orgId, userId: ctx.userId,
      }).catch(() => {});

      return invoice;
    }),
```

- [ ] **Step 5: Add a `projectId` filter + `isChangeOrder` to `list`**

In the `list` input schema add `projectId: z.string().optional()` and `isChangeOrder: z.boolean().optional()`; in the `where` add:
```ts
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.isChangeOrder !== undefined ? { isChangeOrder: input.isChangeOrder } : {}),
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:run -- routers-invoices-change-orders`
Expected: PASS (both cases).

- [ ] **Step 7: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/server/routers/invoices.ts src/test/routers-invoices-change-orders.test.ts
git commit -m "feat(change-orders): createChangeOrder mutation + projectId on create/convert/list"
```

---

### Task 3: Change Orders tab on the project detail page

**Files:**
- Create: `src/components/projects/ChangeOrdersTab.tsx`
- Create: `src/components/projects/ChangeOrderForm.tsx`
- Modify: `src/app/(dashboard)/projects/[id]/page.tsx` (TABS ~37-44, tab content ~155-158)

- [ ] **Step 1: Add a "Change Orders" tab entry**

In `page.tsx`, add to `TABS` after `milestones`:
```ts
  { key: "change-orders", label: "Change Orders" },
```
And in the tab-content section:
```tsx
      {tab === "change-orders" && <ChangeOrdersTab projectId={id} />}
```
Add the import: `import { ChangeOrdersTab } from "@/components/projects/ChangeOrdersTab";`

- [ ] **Step 2: Build `ChangeOrdersTab.tsx` (client component)**

Mirror an existing list tab (e.g. `MilestoneList.tsx`). Requirements:
- `"use client"`; props `{ projectId: string }`.
- `api.invoices.list.useQuery({ projectId, isChangeOrder: true, page: 1, pageSize: 100 })`.
- Render a table: Number (link to `/invoices/${id}`), Date, Total (with currency), Status badge mapping `DRAFT→Draft`, `SENT→Sent`, `ACCEPTED→Approved`, `PAID/converted` shown via existing status. Empty state: "No change orders yet."
- A "New change order" button toggling `<ChangeOrderForm projectId={projectId} onDone={...} />`.
- After create, call `utils.invoices.list.invalidate()`.

- [ ] **Step 3: Build `ChangeOrderForm.tsx` (client component)**

Reuse the estimate line-item editor used by the invoice/estimate form (locate it under `src/components/invoices/` and import the same line-row UI). Minimum fields: repeating line rows (`name`, `qty`, `rate`), an optional `notes`. On submit call `api.invoices.createChangeOrder.useMutation` with `{ projectId, lines: rows.map((r,i)=>({ sort:i, name:r.name, qty:r.qty, rate:r.rate, taxIds:[] })), notes }`; on success call `onDone()`.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open a project, click **Change Orders → New change order**, add a line, save. Verify it appears in the list and at `/invoices` as an estimate. Open its portal link and confirm the existing sign flow renders. Approve, then on the invoice/estimate detail use **Convert to invoice** and confirm lines copy over.

- [ ] **Step 5: Typecheck + commit**
```bash
npx tsc --noEmit
git add "src/app/(dashboard)/projects/[id]/page.tsx" src/components/projects/ChangeOrdersTab.tsx src/components/projects/ChangeOrderForm.tsx
git commit -m "feat(change-orders): project detail Change Orders tab + create form"
```

---

## Milestone 2 — Retainer Burn-down Dashboard

### Task 4: `retainer-burndown.ts` pure service + tests

**Files:**
- Create: `src/server/services/retainer-burndown.ts`
- Test: `src/test/retainer-burndown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/retainer-burndown.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  computeHoursBurndown,
  computeMoneyBurndown,
  type HoursRetainerBurndownInput,
  type MoneyRetainerBurndownInput,
} from "@/server/services/retainer-burndown";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function hours(o: Partial<HoursRetainerBurndownInput> = {}): HoursRetainerBurndownInput {
  return {
    retainerId: "r1", retainerName: "Monthly", clientId: "c1", clientName: "Acme",
    periodId: "p1", periodLabel: "Jun 2026",
    periodStart: new Date("2026-06-01T00:00:00.000Z"),
    periodEnd: new Date("2026-06-30T23:59:59.999Z"),
    includedHours: 20, usedHours: 7, ...o,
  };
}
function money(o: Partial<MoneyRetainerBurndownInput> = {}): MoneyRetainerBurndownInput {
  return {
    retainerId: "r2", clientId: "c2", clientName: "Globex",
    balance: 4000, totalDeposits: 10000, totalDrawdowns: 6000,
    windowDrawdowns: 3000, windowDays: 90, ...o,
  };
}

describe("computeHoursBurndown", () => {
  it("computes remaining, pctUsed and a projected depletion date", () => {
    const r = computeHoursBurndown(hours(), NOW);
    expect(r.kind).toBe("hours");
    expect(r.remaining).toBe(13);
    expect(r.pctUsed).toBeCloseTo(0.35, 5);
    // 7h over 14 elapsed days = 0.5 h/day; 13h remaining ≈ 26 days out.
    expect(r.runRatePerDay).toBeCloseTo(0.5, 5);
    expect(r.projectedDepletionDate).toBe("2026-07-11");
    expect(r.warning).toBe(false);
  });

  it("warns at >= 80% used", () => {
    expect(computeHoursBurndown(hours({ usedHours: 16 }), NOW).warning).toBe(true);
  });

  it("returns null depletion when nothing has been used", () => {
    const r = computeHoursBurndown(hours({ usedHours: 0 }), NOW);
    expect(r.runRatePerDay).toBe(0);
    expect(r.projectedDepletionDate).toBeNull();
  });
});

describe("computeMoneyBurndown", () => {
  it("computes pctUsed from drawdowns/deposits and projects depletion from the window run-rate", () => {
    const r = computeMoneyBurndown(money(), NOW);
    expect(r.kind).toBe("money");
    expect(r.remaining).toBe(4000);
    expect(r.pctUsed).toBeCloseTo(0.6, 5);
    // 3000 over 90 days ≈ 33.33/day; 4000 remaining ≈ 120 days out.
    expect(r.runRatePerDay).toBeCloseTo(33.3333, 3);
    expect(r.projectedDepletionDate).toBe("2026-10-13");
    expect(r.warning).toBe(false);
  });

  it("no deposits → pctUsed 0, no depletion, no warning", () => {
    const r = computeMoneyBurndown(money({ totalDeposits: 0, totalDrawdowns: 0, windowDrawdowns: 0, balance: 0 }), NOW);
    expect(r.pctUsed).toBe(0);
    expect(r.projectedDepletionDate).toBeNull();
    expect(r.warning).toBe(false);
  });

  it("warns at >= 80% used", () => {
    expect(computeMoneyBurndown(money({ totalDrawdowns: 8000 }), NOW).warning).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- retainer-burndown`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/server/services/retainer-burndown.ts`:
```ts
/**
 * Retainer burn-down.
 *
 * Pure projection math for both retainer types — `HoursRetainer` (hours used in
 * a period) and the prepaid money `Retainer` — so it can be unit-tested without
 * a database. The routers build the inputs from Prisma aggregates and feed them
 * in, mirroring the split in client-health-score.ts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_THRESHOLD = 0.8;

export type RetainerKind = "hours" | "money";

export interface HoursRetainerBurndownInput {
  retainerId: string;
  retainerName: string;
  clientId: string;
  clientName: string;
  periodId: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  includedHours: number;
  usedHours: number;
}

export interface MoneyRetainerBurndownInput {
  retainerId: string;
  clientId: string;
  clientName: string;
  balance: number;
  totalDeposits: number;
  totalDrawdowns: number;
  /** Drawdowns within the trailing window (for the run-rate). */
  windowDrawdowns: number;
  windowDays: number;
}

export interface RetainerBurndown {
  retainerId: string;
  kind: RetainerKind;
  clientId: string;
  clientName: string;
  label: string;
  unit: "hours" | "currency";
  /** Included hours OR total deposits. */
  total: number;
  /** Used hours OR total drawdowns. */
  used: number;
  /** Remaining hours OR remaining balance. */
  remaining: number;
  /** 0..1. */
  pctUsed: number;
  /** Hours/day or currency/day. */
  runRatePerDay: number;
  /** ISO "YYYY-MM-DD", or null when run-rate is 0 / already depleted. */
  projectedDepletionDate: string | null;
  warning: boolean;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function projectDepletion(remaining: number, runRatePerDay: number, now: Date): string | null {
  if (runRatePerDay <= 0 || remaining <= 0) return null;
  const daysLeft = remaining / runRatePerDay;
  return isoDate(new Date(now.getTime() + daysLeft * DAY_MS));
}

export function computeHoursBurndown(input: HoursRetainerBurndownInput, now: Date): RetainerBurndown {
  const remaining = round(input.includedHours - input.usedHours);
  const pctUsed = input.includedHours > 0 ? input.usedHours / input.includedHours : 0;
  const elapsedDays = Math.max((now.getTime() - input.periodStart.getTime()) / DAY_MS, 0);
  const runRatePerDay = elapsedDays > 0 ? input.usedHours / elapsedDays : 0;
  return {
    retainerId: input.retainerId,
    kind: "hours",
    clientId: input.clientId,
    clientName: input.clientName,
    label: input.retainerName,
    unit: "hours",
    total: round(input.includedHours),
    used: round(input.usedHours),
    remaining,
    pctUsed: round(pctUsed),
    runRatePerDay: round(runRatePerDay),
    projectedDepletionDate: projectDepletion(remaining, runRatePerDay, now),
    warning: pctUsed >= WARN_THRESHOLD,
  };
}

export function computeMoneyBurndown(input: MoneyRetainerBurndownInput, now: Date): RetainerBurndown {
  const pctUsed = input.totalDeposits > 0 ? input.totalDrawdowns / input.totalDeposits : 0;
  const runRatePerDay = input.windowDays > 0 ? input.windowDrawdowns / input.windowDays : 0;
  return {
    retainerId: input.retainerId,
    kind: "money",
    clientId: input.clientId,
    clientName: input.clientName,
    label: "Prepaid retainer",
    unit: "currency",
    total: round(input.totalDeposits),
    used: round(input.totalDrawdowns),
    remaining: round(input.balance),
    pctUsed: round(pctUsed),
    runRatePerDay: round(runRatePerDay),
    projectedDepletionDate: projectDepletion(input.balance, runRatePerDay, now),
    warning: pctUsed >= WARN_THRESHOLD,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- retainer-burndown`
Expected: PASS. If a projected-date assertion is off by a day, recompute the expected value from the formula and fix the test's expected string (the formula, not the code, is authoritative).

- [ ] **Step 5: Commit**
```bash
git add src/server/services/retainer-burndown.ts src/test/retainer-burndown.test.ts
git commit -m "feat(retainers): pure burn-down projection service (hours + money)"
```

---

### Task 5: Burn-down data builders + router procedures

**Files:**
- Modify: `src/server/routers/hoursRetainers.ts` (add `burndown` query)
- Modify: `src/server/routers/retainers.ts` (add `burndown` query)
- Test: `src/test/routers-retainer-burndown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/routers-retainer-burndown.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { hoursRetainersRouter } from "@/server/routers/hoursRetainers";
import { retainersRouter } from "@/server/routers/retainers";
import { createMockContext } from "./mocks/trpc-context";

describe("retainer burndown procedures", () => {
  let ctx: any;
  beforeEach(() => { ctx = createMockContext(); });

  it("hoursRetainers.burndown returns one row per retainer's active period", async () => {
    ctx.db.hoursRetainer.findMany.mockResolvedValue([
      {
        id: "r1", name: "Monthly", clientId: "c1", client: { id: "c1", name: "Acme" },
        periods: [{
          id: "p1", label: "Jun 2026", status: "ACTIVE",
          periodStart: new Date("2026-06-01T00:00:00Z"),
          periodEnd: new Date("2026-06-30T23:59:59Z"),
          includedHoursSnapshot: { toNumber: () => 20 },
          timeEntries: [{ minutes: { toNumber: () => 420 } }], // 7h
        }],
      },
    ]);
    const rows = await hoursRetainersRouter.createCaller(ctx).burndown();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("hours");
    expect(rows[0].remaining).toBe(13);
  });

  it("retainers.burndown returns one row per money retainer", async () => {
    ctx.db.retainer.findMany.mockResolvedValue([
      {
        id: "r2", clientId: "c2", balance: { toNumber: () => 4000 },
        client: { id: "c2", name: "Globex" },
        transactions: [
          { type: "deposit", amount: { toNumber: () => 10000 }, createdAt: new Date("2026-01-01Z") },
          { type: "drawdown", amount: { toNumber: () => 6000 }, createdAt: new Date("2026-06-01Z") },
        ],
      },
    ]);
    const rows = await retainersRouter.createCaller(ctx).burndown();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("money");
    expect(rows[0].remaining).toBe(4000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- routers-retainer-burndown`
Expected: FAIL — `.burndown is not a function`.

- [ ] **Step 3: Add `hoursRetainers.burndown`**

In `src/server/routers/hoursRetainers.ts` add the import and procedure:
```ts
import { computeHoursBurndown } from "@/server/services/retainer-burndown";
```
```ts
  burndown: protectedProcedure.query(async ({ ctx }) => {
    const retainers = await ctx.db.hoursRetainer.findMany({
      where: { organizationId: ctx.orgId, active: true },
      include: {
        client: { select: { id: true, name: true } },
        periods: {
          where: { status: "ACTIVE" },
          orderBy: { periodStart: "desc" },
          take: 1,
          include: { timeEntries: { select: { minutes: true } } },
        },
      },
    });
    const now = new Date();
    return retainers
      .filter((r) => r.periods.length > 0)
      .map((r) => {
        const p = r.periods[0];
        const usedHours = p.timeEntries.reduce((s, e) => s + e.minutes.toNumber() / 60, 0);
        return computeHoursBurndown(
          {
            retainerId: r.id, retainerName: r.name, clientId: r.clientId,
            clientName: r.client.name, periodId: p.id, periodLabel: p.label,
            periodStart: p.periodStart, periodEnd: p.periodEnd,
            includedHours: p.includedHoursSnapshot.toNumber(), usedHours,
          },
          now,
        );
      })
      .sort((a, b) => b.pctUsed - a.pctUsed);
  }),
```

- [ ] **Step 4: Add `retainers.burndown`**

In `src/server/routers/retainers.ts` add imports (`protectedProcedure` from `../trpc`, `computeMoneyBurndown` from the service) and:
```ts
  burndown: protectedProcedure.query(async ({ ctx }) => {
    const retainers = await ctx.db.retainer.findMany({
      where: { organizationId: ctx.orgId },
      include: {
        client: { select: { id: true, name: true } },
        transactions: { select: { type: true, amount: true, createdAt: true } },
      },
    });
    const now = new Date();
    const windowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return retainers
      .map((r) => {
        let totalDeposits = 0, totalDrawdowns = 0, windowDrawdowns = 0;
        for (const t of r.transactions) {
          const amt = t.amount.toNumber();
          if (t.type === "deposit") totalDeposits += amt;
          if (t.type === "drawdown") {
            totalDrawdowns += amt;
            if (t.createdAt >= windowStart) windowDrawdowns += amt;
          }
        }
        return computeMoneyBurndown(
          {
            retainerId: r.id, clientId: r.clientId, clientName: r.client.name,
            balance: r.balance.toNumber(), totalDeposits, totalDrawdowns,
            windowDrawdowns, windowDays: 90,
          },
          now,
        );
      })
      .filter((r) => r.total > 0 || r.remaining > 0)
      .sort((a, b) => b.pctUsed - a.pctUsed);
  }),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- routers-retainer-burndown`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/server/routers/hoursRetainers.ts src/server/routers/retainers.ts src/test/routers-retainer-burndown.test.ts
git commit -m "feat(retainers): burndown procedures over hours + money retainers"
```

---

### Task 6: Retainer Burn-down report page + nav card

**Files:**
- Create: `src/app/(dashboard)/reports/retainers/page.tsx`
- Create: `src/app/(dashboard)/reports/retainers/loading.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx` (reports array)

- [ ] **Step 1: Add the nav card**

In `reports/page.tsx`, import an icon (`Wallet` from `lucide-react`) and add to the `reports` array:
```tsx
  {
    href: "/reports/retainers",
    label: "Retainer Burn-down",
    description: "Hours and prepaid retainers with projected depletion dates and 80% warnings.",
    icon: <Wallet className="w-4 h-4" />,
    color: "bg-sky-50 text-sky-600",
  },
```

- [ ] **Step 2: Build the page**

Create `src/app/(dashboard)/reports/retainers/page.tsx` as a server component mirroring `reports/time/page.tsx` structure (ReportHeader, back link, PrintReportButton). It calls both procedures:
```tsx
  const [hours, money, org] = await Promise.all([
    api.hoursRetainers.burndown(),
    api.retainers.burndown(),
    api.organization.get(),
  ]);
```
Render two sections ("Hours Retainers", "Prepaid Retainers"). Each row is a card with: client name + label, a progress bar (`width: ${Math.min(pctUsed*100,100)}%`), remaining (`{remaining}h` or `{symbol}{remaining}`), projected depletion date (or "—"), and an amber warning badge `80% used` when `warning`. Sort already done server-side (warnings first via pctUsed desc). Empty states per section: "No active hours retainers." / "No prepaid retainers." Use `org` currency symbol via `api.organization.get()` (same as other pages).

- [ ] **Step 3: Add `loading.tsx`**

Copy `src/app/(dashboard)/reports/time/loading.tsx` (skeleton) to the new folder.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, visit `/reports/retainers`. With seed data, confirm hours + money sections render, bars fill proportionally, and a retainer ≥80% used shows the amber badge.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(dashboard)/reports/retainers" "src/app/(dashboard)/reports/page.tsx"
git commit -m "feat(retainers): burn-down dashboard report page + nav card"
```

---

## Milestone 3 — Project Health Score

### Task 7: `project-health-score.ts` pure service + tests

**Files:**
- Create: `src/server/services/project-health-score.ts`
- Test: `src/test/project-health-score.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/project-health-score.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  calculateProjectHealthScore,
  calculateProjectHealthScores,
  type ProjectHealthInput,
} from "@/server/services/project-health-score";

function base(o: Partial<ProjectHealthInput> = {}): ProjectHealthInput {
  return {
    projectId: "p1", projectName: "Website", clientName: "Acme",
    effectiveBudget: 10000, loggedValue: 4000, isFlatRate: false,
    totalTasks: 10, overdueTasks: 0,
    billableHours: 40, unbilledBillableHours: 0,
    overdueInvoiceCount: 0, overdueInvoiceAmount: 0,
    emailsSent: 10, emailsOpened: 9,
    hasActivity: true, ...o,
  };
}

describe("calculateProjectHealthScore", () => {
  it("scores a healthy project", () => {
    const r = calculateProjectHealthScore(base());
    expect(r.band).toBe("healthy");
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.lowData).toBe(false);
  });

  it("drops the score when over budget", () => {
    const r = calculateProjectHealthScore(base({ loggedValue: 16000 }));
    expect(r.components.budgetBurn.score).toBeLessThan(40);
  });

  it("penalizes overdue tasks", () => {
    const r = calculateProjectHealthScore(base({ overdueTasks: 8 }));
    expect(r.components.overdueTasks.score).toBeLessThan(40);
  });

  it("penalizes a high unbilled share", () => {
    const r = calculateProjectHealthScore(base({ unbilledBillableHours: 40 }));
    expect(r.components.unbilledTime.score).toBeLessThan(60);
  });

  it("flags lowData when the project has no activity, using neutral defaults", () => {
    const r = calculateProjectHealthScore(base({
      hasActivity: false, totalTasks: 0, billableHours: 0,
      effectiveBudget: 0, loggedValue: 0, emailsSent: 0,
    }));
    expect(r.lowData).toBe(true);
    expect(r.score).toBeGreaterThan(40);
  });

  it("sorts worst-first", () => {
    const list = calculateProjectHealthScores([
      base({ projectId: "good" }),
      base({ projectId: "bad", overdueTasks: 9, loggedValue: 18000, overdueInvoiceCount: 3 }),
    ]);
    expect(list[0].projectId).toBe("bad");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- project-health-score`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/server/services/project-health-score.ts`:
```ts
/**
 * Project health scoring.
 *
 * Composite 0-100 health score per project from five deterministic signals —
 * budget burn, overdue tasks, unbilled time, unpaid invoices, and client
 * response rate — plus a band and surfaced signals. Pure function so it can be
 * unit-tested without a database; the router builds inputs from Prisma
 * aggregates and feeds them in, mirroring client-health-score.ts.
 */

export type ProjectHealthBand = "healthy" | "stable" | "at_risk" | "critical";

export interface ProjectHealthInput {
  projectId: string;
  projectName: string;
  clientName: string;
  /** Base budget + approved change-order totals, in money terms. */
  effectiveBudget: number;
  /** Consumed value: hours*rate, or flat amount progress. */
  loggedValue: number;
  isFlatRate: boolean;
  totalTasks: number;
  overdueTasks: number;
  billableHours: number;
  unbilledBillableHours: number;
  overdueInvoiceCount: number;
  overdueInvoiceAmount: number;
  emailsSent: number;
  emailsOpened: number;
  /** False when the project has no tasks/time/invoices to score. */
  hasActivity: boolean;
}

export interface ProjectHealthComponent {
  score: number;
  weight: number;
  detail: string;
}

export interface ProjectHealthScore {
  projectId: string;
  projectName: string;
  clientName: string;
  score: number;
  band: ProjectHealthBand;
  lowData: boolean;
  components: {
    budgetBurn: ProjectHealthComponent;
    overdueTasks: ProjectHealthComponent;
    unbilledTime: ProjectHealthComponent;
    unpaidInvoices: ProjectHealthComponent;
    responseRate: ProjectHealthComponent;
  };
  signals: string[];
}

const WEIGHTS = {
  budgetBurn: 0.3,
  overdueTasks: 0.2,
  unbilledTime: 0.15,
  unpaidInvoices: 0.2,
  responseRate: 0.15,
} as const;

const NEUTRAL_SCORE = 60;

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}
function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function scoreBudget(input: ProjectHealthInput): ProjectHealthComponent {
  if (input.effectiveBudget <= 0) {
    return { score: NEUTRAL_SCORE, weight: WEIGHTS.budgetBurn, detail: "No budget set." };
  }
  const ratio = input.loggedValue / input.effectiveBudget;
  // Within budget: gentle slope to 85 at 100%. Over budget: steep drop.
  const score = ratio <= 1 ? clamp(100 - ratio * 15) : clamp(85 - (ratio - 1) * 170);
  return {
    score: round(score),
    weight: WEIGHTS.budgetBurn,
    detail: `${Math.round(ratio * 100)}% of budget consumed.`,
  };
}

function scoreOverdueTasks(input: ProjectHealthInput): ProjectHealthComponent {
  if (input.totalTasks === 0) {
    return { score: NEUTRAL_SCORE, weight: WEIGHTS.overdueTasks, detail: "No tasks yet." };
  }
  const ratio = input.overdueTasks / input.totalTasks;
  return {
    score: round(clamp(100 - ratio * 120)),
    weight: WEIGHTS.overdueTasks,
    detail: `${input.overdueTasks} of ${input.totalTasks} task${input.totalTasks === 1 ? "" : "s"} overdue.`,
  };
}

function scoreUnbilled(input: ProjectHealthInput): ProjectHealthComponent {
  if (input.billableHours === 0) {
    return { score: 100, weight: WEIGHTS.unbilledTime, detail: "No billable time logged." };
  }
  const ratio = input.unbilledBillableHours / input.billableHours;
  return {
    score: round(clamp(100 - ratio * 60)),
    weight: WEIGHTS.unbilledTime,
    detail: `${Math.round(ratio * 100)}% of billable hours not yet invoiced.`,
  };
}

function scoreUnpaid(input: ProjectHealthInput): ProjectHealthComponent {
  let score = 100 - clamp(input.overdueInvoiceCount * 20, 0, 60);
  if (input.overdueInvoiceAmount > 0 && input.overdueInvoiceCount === 0) score -= 10;
  return {
    score: round(clamp(score)),
    weight: WEIGHTS.unpaidInvoices,
    detail: input.overdueInvoiceCount > 0
      ? `${input.overdueInvoiceCount} overdue invoice${input.overdueInvoiceCount === 1 ? "" : "s"} ($${round(input.overdueInvoiceAmount).toLocaleString("en-US")}).`
      : "No overdue invoices.",
  };
}

function scoreResponse(input: ProjectHealthInput): ProjectHealthComponent {
  if (input.emailsSent === 0) {
    return { score: NEUTRAL_SCORE, weight: WEIGHTS.responseRate, detail: "No tracked client emails." };
  }
  const openRate = input.emailsOpened / input.emailsSent;
  return {
    score: round(clamp(openRate * 100)),
    weight: WEIGHTS.responseRate,
    detail: `${Math.round(openRate * 100)}% email open rate.`,
  };
}

function bandFor(score: number): ProjectHealthBand {
  if (score >= 75) return "healthy";
  if (score >= 55) return "stable";
  if (score >= 35) return "at_risk";
  return "critical";
}

function buildSignals(input: ProjectHealthInput, c: ProjectHealthScore["components"]): string[] {
  const s: string[] = [];
  if (c.budgetBurn.score < 40) s.push("Over budget — review scope or raise a change order.");
  if (c.overdueTasks.score < 50) s.push("Several tasks are overdue — schedule a check-in.");
  if (c.unbilledTime.score < 60) s.push("Significant unbilled time — invoice the logged hours.");
  if (c.unpaidInvoices.score < 50) s.push("Overdue invoices on this client — prioritize collections.");
  return s;
}

export function calculateProjectHealthScore(input: ProjectHealthInput): ProjectHealthScore {
  const budgetBurn = scoreBudget(input);
  const overdueTasks = scoreOverdueTasks(input);
  const unbilledTime = scoreUnbilled(input);
  const unpaidInvoices = scoreUnpaid(input);
  const responseRate = scoreResponse(input);

  const composite =
    budgetBurn.score * budgetBurn.weight +
    overdueTasks.score * overdueTasks.weight +
    unbilledTime.score * unbilledTime.weight +
    unpaidInvoices.score * unpaidInvoices.weight +
    responseRate.score * responseRate.weight;

  const components = { budgetBurn, overdueTasks, unbilledTime, unpaidInvoices, responseRate };
  const score = round(clamp(composite));
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    clientName: input.clientName,
    score,
    band: bandFor(score),
    lowData: !input.hasActivity,
    components,
    signals: buildSignals(input, components),
  };
}

export function calculateProjectHealthScores(inputs: ProjectHealthInput[]): ProjectHealthScore[] {
  return inputs
    .map(calculateProjectHealthScore)
    .sort((a, b) => a.score - b.score || a.projectName.localeCompare(b.projectName));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- project-health-score`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/server/services/project-health-score.ts src/test/project-health-score.test.ts
git commit -m "feat(project-health): pure composite scoring service"
```

---

### Task 8: Project-health data builder + `projects.healthScore`/`healthScores`

**Files:**
- Create: `src/server/services/project-health-data.ts`
- Modify: `src/server/routers/projects.ts` (add two queries)
- Test: `src/test/routers-project-health.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/routers-project-health.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { projectsRouter } from "@/server/routers/projects";
import { createMockContext } from "./mocks/trpc-context";

describe("projects.healthScore", () => {
  let ctx: any;
  beforeEach(() => { ctx = createMockContext(); });

  it("returns null when the project is not found", async () => {
    ctx.db.project.findFirst.mockResolvedValue(null);
    const r = await projectsRouter.createCaller(ctx).healthScore({ projectId: "missing" });
    expect(r.score).toBeNull();
  });

  it("returns a composite score for a project with data", async () => {
    ctx.db.project.findFirst.mockResolvedValue({
      id: "p1", name: "Website", isFlatRate: false,
      rate: { toNumber: () => 100 }, projectedHours: 100,
      client: { id: "c1", name: "Acme" },
      tasks: [
        { isCompleted: false, dueDate: new Date("2020-01-01") }, // overdue
        { isCompleted: true, dueDate: null },
      ],
      timeEntries: [
        { minutes: { toNumber: () => 600 }, invoiceLineId: null, project: { isFlatRate: false, rate: { toNumber: () => 100 } }, retainerId: null },
      ],
    });
    ctx.db.invoice.findMany.mockResolvedValue([]); // approved change orders + client invoices
    ctx.db.emailEvent.findMany.mockResolvedValue([]);
    const r = await projectsRouter.createCaller(ctx).healthScore({ projectId: "p1" });
    expect(r.score).not.toBeNull();
    expect(typeof r.score!.score).toBe("number");
  });
});
```
> The exact mock shape can be adjusted to match the builder you write in Step 3 — keep the two behaviors (null when missing; numeric score when present).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- routers-project-health`
Expected: FAIL — `.healthScore is not a function`.

- [ ] **Step 3: Write the data builder**

Create `src/server/services/project-health-data.ts`. Export `buildProjectHealthInput(db, orgId, projectId, now)` returning `ProjectHealthInput | null`, and `buildProjectHealthInputs(db, orgId, now)` returning `ProjectHealthInput[]` for all non-archived projects. The single builder:
- Loads the project (`findFirst` scoped to org) with `client`, `tasks` (select `isCompleted, dueDate`), and `timeEntries` (select `minutes, invoiceLineId, retainerId, project: { select: { isFlatRate, rate } }`). Return `null` if not found.
- `loggedHours` = Σ minutes/60; `loggedValue` = flat-rate ? min(loggedHours,…)*rate is N/A → for flat-rate use `projectedHours*rate` baseline; for hourly `loggedHours*rate`. Use: `loggedValue = isFlatRate ? loggedHours * rate : loggedHours * rate` (both hours*rate — flat-rate projects still track logged value for burn visibility).
- `effectiveBudget` = `projectedHours * rate` + Σ approved change-order totals: query `db.invoice.findMany({ where: { organizationId: orgId, projectId, isChangeOrder: true, status: "ACCEPTED" }, select: { total: true } })` and sum `.toNumber()`.
- `billableHours` = Σ (minutes/60) where the entry is billable. Import `classifyBillable` from `src/server/services/utilization.ts` (Task 10) and call it with `{ retainerId, project: project ? { isFlatRate, rate: rate.toNumber() } : null }` so the rule stays in one place. (If Task 10 isn't built yet, the equivalent inline rule is `retainerId != null || (project && !project.isFlatRate && project.rate.toNumber() > 0)`.)
- `unbilledBillableHours` = same filter but `invoiceLineId == null`.
- Tasks: `totalTasks`, `overdueTasks` = count where `!isCompleted && dueDate && dueDate < now`.
- Overdue invoices (client-level fallback): `db.invoice.findMany({ where: { organizationId: orgId, clientId, isArchived: false, status: { in: [SENT, PARTIALLY_PAID, OVERDUE] }, dueDate: { lt: now } }, select: { total: true } })` → `overdueInvoiceCount`, `overdueInvoiceAmount` (sum totals).
- Engagement: emails for that client (reuse the per-invoice `emailEvent` approach from `buildClientHealthInputForClient`), set `emailsSent`/`emailsOpened`.
- `hasActivity` = `totalTasks > 0 || loggedHours > 0`.

The org-wide builder runs the same logic over all projects with batched queries (acceptable to loop per project for a first version; note it in a comment).

- [ ] **Step 4: Add the procedures to `projects.ts`**
```ts
import { calculateProjectHealthScore, calculateProjectHealthScores } from "../services/project-health-score";
import { buildProjectHealthInput, buildProjectHealthInputs } from "../services/project-health-data";
```
```ts
  healthScore: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const built = await buildProjectHealthInput(ctx.db, ctx.orgId, input.projectId, new Date());
      if (!built) return { score: null };
      return { score: calculateProjectHealthScore(built) };
    }),

  healthScores: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const inputs = await buildProjectHealthInputs(ctx.db, ctx.orgId, now);
    return { generatedAt: now.toISOString(), scores: calculateProjectHealthScores(inputs) };
  }),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- routers-project-health`
Expected: PASS. Adjust the mock shapes in the test to match the exact `select`s you used.

- [ ] **Step 6: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/server/services/project-health-data.ts src/server/routers/projects.ts src/test/routers-project-health.test.ts
git commit -m "feat(project-health): data builder + healthScore/healthScores procedures"
```

---

### Task 9: Project health badge + report page + nav card

**Files:**
- Create: `src/components/projects/ProjectHealthBadge.tsx`
- Create: `src/app/(dashboard)/reports/project-health/page.tsx` + `loading.tsx`
- Modify: `src/app/(dashboard)/projects/[id]/page.tsx` (header, near status badge ~85)
- Modify: `src/app/(dashboard)/reports/page.tsx` (reports array)

- [ ] **Step 1: Build `ProjectHealthBadge.tsx`**

Mirror `src/components/clients/ClientHealthBadge.tsx`. `"use client"`; prop `{ projectId }`; `api.projects.healthScore.useQuery({ projectId })`; render a colored pill (`healthy` emerald / `stable` blue / `at_risk` amber / `critical` rose) showing the score, with a popover listing the five components' `detail` lines. Render nothing while loading or when `score === null`.

- [ ] **Step 2: Add the badge to the project header**

In `projects/[id]/page.tsx`, import the badge and render it next to the status badge inside the header `flex items-center gap-3` row:
```tsx
            <ProjectHealthBadge projectId={id} />
```

- [ ] **Step 3: Add the nav card**

In `reports/page.tsx`, import `Activity` from `lucide-react` and add:
```tsx
  {
    href: "/reports/project-health",
    label: "Project Health",
    description: "Composite health per project from budget, tasks, unbilled time, and invoices.",
    icon: <Activity className="w-4 h-4" />,
    color: "bg-rose-50 text-rose-600",
  },
```

- [ ] **Step 4: Build the report page**

Create `src/app/(dashboard)/reports/project-health/page.tsx` mirroring `reports/time/page.tsx`. Call `api.projects.healthScores()`. Render a table: Project, Client, Score (colored), Band, and the five component sub-scores (or a compact "weakest factor" cell). Sorted worst-first (already). Empty state: "No projects to score yet." Add `loading.tsx` (copy the time report's skeleton).

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`. Visit a project detail page → confirm the health pill renders with a popover. Visit `/reports/project-health` → confirm the table renders sorted worst-first.

- [ ] **Step 6: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/components/projects/ProjectHealthBadge.tsx "src/app/(dashboard)/reports/project-health" "src/app/(dashboard)/projects/[id]/page.tsx" "src/app/(dashboard)/reports/page.tsx"
git commit -m "feat(project-health): detail badge + project-health report page + nav card"
```

---

## Milestone 4 — Utilization Report

### Task 10: `classifyBillable` + utilization aggregation pure helper + tests

**Files:**
- Create: `src/server/services/utilization.ts`
- Test: `src/test/utilization.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/utilization.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { classifyBillable, summarizeUtilization, type UtilizationEntry } from "@/server/services/utilization";

describe("classifyBillable", () => {
  it("treats hourly-project time as billable", () => {
    expect(classifyBillable({ retainerId: null, project: { isFlatRate: false, rate: 100 } })).toBe(true);
  });
  it("treats retainer time as billable", () => {
    expect(classifyBillable({ retainerId: "r1", project: null })).toBe(true);
  });
  it("treats flat-rate project time as non-billable", () => {
    expect(classifyBillable({ retainerId: null, project: { isFlatRate: true, rate: 100 } })).toBe(false);
  });
  it("treats rate-0 / no-project time as non-billable", () => {
    expect(classifyBillable({ retainerId: null, project: { isFlatRate: false, rate: 0 } })).toBe(false);
    expect(classifyBillable({ retainerId: null, project: null })).toBe(false);
  });
});

describe("summarizeUtilization", () => {
  const entries: UtilizationEntry[] = [
    { date: new Date("2026-06-01T12:00:00Z"), minutes: 120, retainerId: null, projectId: "p1", projectName: "A", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: false, rate: 100 } },
    { date: new Date("2026-06-02T12:00:00Z"), minutes: 60,  retainerId: null, projectId: "p2", projectName: "B", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: true, rate: 100 } },
  ];

  it("computes overall utilization (billable/total)", () => {
    const r = summarizeUtilization(entries, { groupBy: "month", dimension: "client" });
    expect(r.summary.billableHours).toBeCloseTo(2, 5);
    expect(r.summary.nonBillableHours).toBeCloseTo(1, 5);
    expect(r.summary.totalHours).toBeCloseTo(3, 5);
    expect(r.summary.utilizationPct).toBeCloseTo(2 / 3, 5);
  });

  it("groups by client", () => {
    const r = summarizeUtilization(entries, { groupBy: "month", dimension: "client" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].label).toBe("Acme");
  });

  it("groups by month bucket", () => {
    const r = summarizeUtilization(entries, { groupBy: "month", dimension: "project" });
    expect(r.rows.map((x) => x.label).sort()).toEqual(["A", "B"]);
  });

  it("no entries → zero utilization, no NaN", () => {
    const r = summarizeUtilization([], { groupBy: "week", dimension: "user" });
    expect(r.summary.utilizationPct).toBe(0);
    expect(r.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- utilization`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/server/services/utilization.ts`:
```ts
/**
 * Utilization aggregation. Pure functions over time entries so they can be
 * unit-tested without a DB. "Billable" is derived (there is no billable flag on
 * TimeEntry): billable = an hours-retainer entry, or time on a non-flat-rate
 * project with a positive rate.
 */

export type UtilizationGroupBy = "week" | "month";
export type UtilizationDimension = "client" | "project" | "user";

export interface UtilizationEntry {
  date: Date;
  minutes: number;
  retainerId: string | null;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  userId: string | null;
  userName: string | null;
  project: { isFlatRate: boolean; rate: number } | null;
}

export interface UtilizationRow {
  key: string;
  label: string;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  utilizationPct: number;
}

export interface UtilizationResult {
  groupBy: UtilizationGroupBy;
  dimension: UtilizationDimension;
  rows: UtilizationRow[];
  summary: Omit<UtilizationRow, "key" | "label">;
}

export function classifyBillable(entry: {
  retainerId: string | null;
  project: { isFlatRate: boolean; rate: number } | null;
}): boolean {
  if (entry.retainerId) return true;
  if (entry.project && !entry.project.isFlatRate && entry.project.rate > 0) return true;
  return false;
}

function pct(billable: number, total: number): number {
  return total > 0 ? billable / total : 0;
}

function dimensionKey(e: UtilizationEntry, dim: UtilizationDimension): { key: string; label: string } {
  if (dim === "client") return { key: e.clientId ?? "none", label: e.clientName ?? "Unassigned" };
  if (dim === "project") return { key: e.projectId ?? "none", label: e.projectName ?? "No project" };
  return { key: e.userId ?? "none", label: e.userName ?? "Unknown" };
}

export function summarizeUtilization(
  entries: UtilizationEntry[],
  opts: { groupBy: UtilizationGroupBy; dimension: UtilizationDimension },
): UtilizationResult {
  const rows = new Map<string, UtilizationRow>();
  let sumBillable = 0;
  let sumNon = 0;

  for (const e of entries) {
    const hrs = e.minutes / 60;
    const billable = classifyBillable(e);
    if (billable) sumBillable += hrs;
    else sumNon += hrs;

    const { key, label } = dimensionKey(e, opts.dimension);
    const row = rows.get(key) ?? { key, label, billableHours: 0, nonBillableHours: 0, totalHours: 0, utilizationPct: 0 };
    if (billable) row.billableHours += hrs;
    else row.nonBillableHours += hrs;
    row.totalHours += hrs;
    rows.set(key, row);
  }

  const rowList = Array.from(rows.values())
    .map((r) => ({ ...r, utilizationPct: pct(r.billableHours, r.totalHours) }))
    .sort((a, b) => b.totalHours - a.totalHours || a.label.localeCompare(b.label));

  const total = sumBillable + sumNon;
  return {
    groupBy: opts.groupBy,
    dimension: opts.dimension,
    rows: rowList,
    summary: {
      billableHours: sumBillable,
      nonBillableHours: sumNon,
      totalHours: total,
      utilizationPct: pct(sumBillable, total),
    },
  };
}
```
> Note: `groupBy` (week/month) is carried through for the UI's period toggle and the date-range query; the dimension drives the row grouping. A future revision can add a time-series breakdown — out of scope here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- utilization`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/server/services/utilization.ts src/test/utilization.test.ts
git commit -m "feat(utilization): pure billable classification + aggregation helper"
```

---

### Task 11: `reports.utilization` procedure + test

**Files:**
- Modify: `src/server/routers/reports.ts` (add `utilization` after `timeTracking` ~601)
- Test: add a `describe("utilization")` block to `src/test/routers-reports-procedures.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/test/routers-reports-procedures.test.ts`:
```ts
  describe("utilization", () => {
    it("returns billable vs non-billable split with utilization %", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([
        { minutes: { toNumber: () => 120 }, date: new Date("2026-06-01Z"), retainerId: null, userId: "u1",
          project: { id: "p1", name: "A", isFlatRate: false, rate: { toNumber: () => 100 }, client: { id: "c1", name: "Acme" } } },
        { minutes: { toNumber: () => 60 }, date: new Date("2026-06-02Z"), retainerId: null, userId: "u1",
          project: { id: "p2", name: "B", isFlatRate: true, rate: { toNumber: () => 100 }, client: { id: "c1", name: "Acme" } } },
      ]);
      const r = await caller.utilization({ groupBy: "month", dimension: "client" });
      expect(r.summary.billableHours).toBeCloseTo(2, 5);
      expect(r.summary.nonBillableHours).toBeCloseTo(1, 5);
      expect(r.summary.utilizationPct).toBeCloseTo(2 / 3, 5);
      expect(r.rows[0].label).toBe("Acme");
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- routers-reports-procedures -t utilization`
Expected: FAIL — `caller.utilization is not a function`.

- [ ] **Step 3: Implement the procedure**

In `src/server/routers/reports.ts`, import the helper and add the procedure:
```ts
import { summarizeUtilization, type UtilizationEntry } from "../services/utilization";
```
```ts
  utilization: protectedProcedure
    .input(
      dateRangeSchema.extend({
        groupBy: z.enum(["week", "month"]).default("month"),
        dimension: z.enum(["client", "project", "user"]).default("project"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.db.timeEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.from || input.to
            ? { date: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
            : {}),
        },
        select: {
          minutes: true, date: true, retainerId: true, userId: true,
          project: {
            select: { id: true, name: true, isFlatRate: true, rate: true, client: { select: { id: true, name: true } } },
          },
        },
      });

      const mapped: UtilizationEntry[] = entries.map((e) => ({
        date: e.date,
        minutes: e.minutes.toNumber(),
        retainerId: e.retainerId,
        projectId: e.project?.id ?? null,
        projectName: e.project?.name ?? null,
        clientId: e.project?.client.id ?? null,
        clientName: e.project?.client.name ?? null,
        userId: e.userId,
        userName: e.userId, // user display name is resolved in the UI; id is a stable key
        project: e.project ? { isFlatRate: e.project.isFlatRate, rate: e.project.rate.toNumber() } : null,
      }));

      return summarizeUtilization(mapped, { groupBy: input.groupBy, dimension: input.dimension });
    }),
```
> `dateRangeSchema` already exists in `reports.ts` (used by `timeTracking`). The `user` dimension uses `userId` as both key and label for now; the UI maps ids → names via `api.team`/members if a friendlier label is wanted.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- routers-reports-procedures -t utilization`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/server/routers/reports.ts src/test/routers-reports-procedures.test.ts
git commit -m "feat(utilization): reports.utilization procedure"
```

---

### Task 12: Utilization report page + nav card

**Files:**
- Create: `src/app/(dashboard)/reports/utilization/page.tsx` + `loading.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx` (reports array)

- [ ] **Step 1: Add the nav card**

In `reports/page.tsx`, import `Percent` from `lucide-react` and add:
```tsx
  {
    href: "/reports/utilization",
    label: "Utilization",
    description: "Billable vs non-billable time by client, project, or user.",
    icon: <Percent className="w-4 h-4" />,
    color: "bg-cyan-50 text-cyan-600",
  },
```

- [ ] **Step 2: Build the page**

Create `src/app/(dashboard)/reports/utilization/page.tsx` mirroring `reports/time/page.tsx`:
- Read `searchParams` for `from`, `to`, `groupBy` (default "month"), `dimension` (default "project").
- Call `api.reports.utilization({ from, to, groupBy, dimension })` + `api.organization.get()`.
- Controls: `<ReportFilters basePath="/reports/utilization" .../>` for dates; two link-button toggles for Week/Month and Client/Project/User that set the query params (mirror how other report pages pass `?groupBy=`/`?dimension=` — use `<Link>` chips preserving existing params).
- Summary cards: Overall Utilization (`{(utilizationPct*100).toFixed(1)}%`), Billable Hours, Non-billable Hours.
- Table: group label, Billable (h), Non-billable (h), Total (h), Utilization % (a pill or bar). Empty state: "No time entries for this period."
- If `dimension === "user"`, the row label is a user id; resolve to names by also calling `api.team.list()` (or equivalent) and mapping — acceptable to show the id if no member match.

- [ ] **Step 3: Add `loading.tsx`**

Copy the time report's `loading.tsx` skeleton into the new folder.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`. Visit `/reports/utilization`. Toggle Week/Month and Client/Project/User; confirm the split + utilization % update and flat-rate project time lands in Non-billable.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(dashboard)/reports/utilization" "src/app/(dashboard)/reports/page.tsx"
git commit -m "feat(utilization): utilization report page + nav card"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npm run test:run`
Expected: PASS (all new + existing tests).

- [ ] **Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Review against the spec**

Re-read `docs/superpowers/specs/2026-06-09-project-retainer-features-design.md` and confirm each feature's data layer, UI, and edge cases are covered.

---

## Notes / Decisions carried from the spec
- Change orders **reuse estimate machinery** — no new model; `projectId` + `isChangeOrder` on `Invoice`.
- Billable is **derived** (`classifyBillable`): hourly-project or retainer time = billable; flat-rate / rate-0 / no-project = non-billable.
- Burn-down covers **both** retainer types; money "80% used" = drawdowns/deposits over the retainer's life; hours warning is per active period.
- Project health "unpaid invoices" falls back to **client-level** overdue invoices (invoices link to clients, not projects) — two projects for one client can share that signal (accepted in spec).
- Approved change-order totals are summed at **read time** into the project's effective budget; `Project.projectedHours` is never mutated.

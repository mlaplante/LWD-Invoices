# Proposals Section + AI Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give proposals a first-class home — a nav section, a proposals-centric list, an AI-assisted creation wizard, and a thin detail page — on top of the existing estimate-backed proposal machinery.

**Architecture:** A "proposal" is an existing `ESTIMATE`-type `Invoice` plus its 1:1 `ProposalContent`. No schema change. Most pieces already exist (AI generation, section editor, file upload, PDF, portal signing, nudges). This plan adds entry points: three thin tRPC procedures (`generateDraft`, `createFromWizard`, `list`), one extracted shared component (`ProposalSectionsEditor`), nav entries, and three routes (`/proposals`, `/proposals/new`, `/proposals/[id]`).

**Tech Stack:** Next.js App Router (server + client components), tRPC, Prisma (`@/generated/prisma`), Zod, Vitest with a mocked Prisma context, Tailwind + shadcn UI, lucide-react icons, Gemini via existing `generateProposal` service.

**Design doc:** `docs/superpowers/specs/2026-06-09-proposals-section-ai-wizard-design.md`

**Permissions decision:** `generateDraft` and `createFromWizard` are `requireRole("OWNER", "ADMIN")` (matches `invoices.create`; accountants are excluded so the wizard never dead-ends at save). The existing invoice-page `proposals.generate` keeps its current `OWNER/ADMIN/ACCOUNTANT` roles — out of scope.

---

## File Structure

**Backend (modify):**
- `src/server/routers/proposals.ts` — extract `buildProposalDraft` helper; refactor `generate`; add `generateDraft`, `createFromWizard`, `list`.
- `src/server/routers/proposals-helpers.ts` — **create**: pure `deriveProposalStatus` + `ProposalStatus` type (unit-testable).

**Frontend (create):**
- `src/components/proposals/ProposalSectionsEditor.tsx` — extracted presentational section editor.
- `src/components/proposals/ProposalList.tsx` — proposals-centric table.
- `src/components/proposals/ProposalWizard.tsx` — two-step creation wizard (client component).
- `src/app/(dashboard)/proposals/page.tsx` — list route (server).
- `src/app/(dashboard)/proposals/new/page.tsx` — wizard route (server shell → client wizard).
- `src/app/(dashboard)/proposals/[id]/page.tsx` — thin detail wrapper (server).

**Frontend (modify):**
- `src/components/invoices/ProposalEditor.tsx` — render the extracted `ProposalSectionsEditor`.
- `src/components/layout/SidebarNav.tsx` — add Proposals nav item.
- `src/components/layout/MobileNav.tsx` — add Proposals tab.

**Tests (create):**
- `src/test/proposals-generate-draft.router.test.ts`
- `src/test/proposals-create-from-wizard.router.test.ts`
- `src/test/proposals-helpers.status.test.ts`

---

## Task 1: Extract `buildProposalDraft` helper + add `generateDraft`

**Files:**
- Modify: `src/server/routers/proposals.ts`
- Test: `src/test/proposals-generate-draft.router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/proposals-generate-draft.router.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { proposalsRouter } from "@/server/routers/proposals";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("proposals.generateDraft — client-based AI draft", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = proposalsRouter.createCaller(ctx);
  });

  it("404s a client that belongs to another org", async () => {
    ctx.db.client.findFirst.mockResolvedValue(null);
    await expect(caller.generateDraft({ clientId: "other-org-client" })).rejects.toThrow(TRPCError);
    const where = ctx.db.client.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
  });

  it("scopes template, past-proposal, and item context to the caller's org and returns a draft", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "c1", name: "Acme" });
    ctx.db.proposalTemplate.findFirst.mockResolvedValue({ sections: [] });
    ctx.db.proposalContent.findMany.mockResolvedValue([]);
    ctx.db.item.findMany.mockResolvedValue([]);

    // GEMINI_API_KEY is unset in test env → generateProposal returns null → { draft: null }.
    const result = await caller.generateDraft({ clientId: "c1" });
    expect(result).toEqual({ draft: null });

    expect(ctx.db.proposalTemplate.findFirst.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.proposalContent.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.item.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });

  it("validates a supplied project belongs to the client and org", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "c1", name: "Acme" });
    ctx.db.project.findFirst.mockResolvedValue(null);
    await expect(caller.generateDraft({ clientId: "c1", projectId: "p-foreign" })).rejects.toThrow(TRPCError);
    const where = ctx.db.project.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
    expect(where.clientId).toBe("c1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/proposals-generate-draft.router.test.ts`
Expected: FAIL — `caller.generateDraft is not a function`.

- [ ] **Step 3: Refactor `generate` and add `generateDraft`**

In `src/server/routers/proposals.ts`, add `PrismaClient` to the prisma import if not present and add this helper above the router (after the imports):

```ts
import type { PrismaClient } from "@/generated/prisma";

async function buildProposalDraft(
  ctx: { db: PrismaClient; orgId: string },
  args: {
    clientName: string;
    projectName: string | null;
    projectDescription: string | null;
    templateId?: string;
    excludeInvoiceId?: string;
  },
) {
  const template = await ctx.db.proposalTemplate.findFirst({
    where: args.templateId
      ? { id: args.templateId, organizationId: ctx.orgId }
      : { organizationId: ctx.orgId, isDefault: true },
  });
  if (!template)
    throw new TRPCError({ code: "BAD_REQUEST", message: "No template available to generate from" });

  const [pastProposals, items] = await Promise.all([
    ctx.db.proposalContent.findMany({
      where: {
        organizationId: ctx.orgId,
        ...(args.excludeInvoiceId ? { invoiceId: { not: args.excludeInvoiceId } } : {}),
      },
      select: { sections: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    ctx.db.item.findMany({
      where: { organizationId: ctx.orgId },
      select: { id: true, name: true, rate: true },
    }),
  ]);

  const draft = await generateProposal({
    clientName: args.clientName,
    projectName: args.projectName,
    projectDescription: args.projectDescription,
    templateSections: template.sections as unknown as { key: string; title: string; content: string }[],
    pastProposals: pastProposals.map(
      (p) => p.sections as unknown as { key: string; title: string; content: string }[],
    ),
    items: items.map((i) => ({ id: i.id, name: i.name, rate: i.rate === null ? null : Number(i.rate) })),
  });

  return { draft };
}
```

Replace the existing `generate` procedure body (everything after `.mutation(async ({ ctx, input }) => {`) so it delegates to the helper:

```ts
  generate: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ invoiceId: z.string(), templateId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId, type: "ESTIMATE" },
        select: {
          id: true,
          client: {
            select: { name: true, projects: { select: { name: true, description: true }, take: 1 } },
          },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Estimate not found" });
      const project = invoice.client.projects[0];
      return buildProposalDraft(ctx, {
        clientName: invoice.client.name,
        projectName: project?.name ?? null,
        projectDescription: project?.description ?? null,
        templateId: input.templateId,
        excludeInvoiceId: input.invoiceId,
      });
    }),
```

Add `generateDraft` immediately after `generate`:

```ts
  generateDraft: requireRole("OWNER", "ADMIN")
    .input(z.object({ clientId: z.string(), projectId: z.string().optional(), templateId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.clientId, organizationId: ctx.orgId },
        select: { id: true, name: true },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

      let project: { name: string; description: string | null } | null = null;
      if (input.projectId) {
        project = await ctx.db.project.findFirst({
          where: { id: input.projectId, organizationId: ctx.orgId, clientId: input.clientId },
          select: { name: true, description: true },
        });
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return buildProposalDraft(ctx, {
        clientName: client.name,
        projectName: project?.name ?? null,
        projectDescription: project?.description ?? null,
        templateId: input.templateId,
      });
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/proposals-generate-draft.router.test.ts src/test/proposals-generate.router.test.ts`
Expected: PASS (existing `generate` test still green after the refactor).

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/proposals.ts src/test/proposals-generate-draft.router.test.ts
git commit -m "feat(proposals): client-based generateDraft via shared buildProposalDraft helper"
```

---

## Task 2: Add `createFromWizard` mutation

**Files:**
- Modify: `src/server/routers/proposals.ts`
- Test: `src/test/proposals-create-from-wizard.router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/proposals-create-from-wizard.router.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the money/tax services so the test exercises the procedure's own logic,
// not the tax engine (which has its own tests).
vi.mock("@/server/lib/tax-helpers", () => ({ getOrgTaxMap: vi.fn(async () => ({})) }));
vi.mock("@/server/services/invoice-tax-resolver", () => ({
  resolveInvoiceTax: vi.fn(async () => ({
    invoice: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100, stripeTaxCalculationId: null },
    lines: [{ subtotal: 100, taxTotal: 0, total: 100, legacyTaxBreakdown: [], stripeTaxBreakdown: [] }],
  })),
}));
vi.mock("@/server/services/invoice-numbering", () => ({ generateInvoiceNumber: vi.fn(async () => "EST-001") }));
vi.mock("@/lib/portal-session", () => ({ generatePortalToken: vi.fn(() => "tok_test") }));

import { proposalsRouter } from "@/server/routers/proposals";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

const SECTIONS = [{ key: "scope", title: "Scope", content: "Build it." }];

describe("proposals.createFromWizard", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = proposalsRouter.createCaller(ctx);
    ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123", stripeTaxEnabled: false });
    ctx.db.currency.findFirst.mockResolvedValue({ id: "cur1", isDefault: true });
    ctx.db.invoice.create.mockResolvedValue({ id: "inv-new" });
    ctx.db.proposalContent.create.mockResolvedValue({ id: "pc-new" });
  });

  it("rejects a client from another org", async () => {
    ctx.db.client.findFirst.mockResolvedValue(null); // assertInOrg → NOT_FOUND
    await expect(
      caller.createFromWizard({ clientId: "foreign", sections: SECTIONS, lineItems: [] }),
    ).rejects.toThrow(TRPCError);
  });

  it("throws BAD_REQUEST when the org has no currency", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "c1", organizationId: "test-org-123" });
    ctx.db.currency.findFirst.mockResolvedValue(null);
    await expect(
      caller.createFromWizard({ clientId: "c1", sections: SECTIONS, lineItems: [] }),
    ).rejects.toThrow("No currency configured");
  });

  it("creates an org-scoped ESTIMATE + ProposalContent and returns the invoice id", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "c1", organizationId: "test-org-123" });
    const res = await caller.createFromWizard({
      clientId: "c1",
      sections: SECTIONS,
      lineItems: [{ name: "Design", qty: 2, rate: 50, sourceId: "item1" }],
    });
    expect(res).toEqual({ invoiceId: "inv-new" });

    const invData = ctx.db.invoice.create.mock.calls[0][0].data;
    expect(invData.type).toBe("ESTIMATE");
    expect(invData.status).toBe("DRAFT");
    expect(invData.organizationId).toBe("test-org-123");

    const pcData = ctx.db.proposalContent.create.mock.calls[0][0].data;
    expect(pcData.invoiceId).toBe("inv-new");
    expect(pcData.organizationId).toBe("test-org-123");
    expect(pcData.sections).toEqual(SECTIONS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/proposals-create-from-wizard.router.test.ts`
Expected: FAIL — `caller.createFromWizard is not a function`.

- [ ] **Step 3: Implement `createFromWizard`**

In `src/server/routers/proposals.ts`, add these imports:

```ts
import { Prisma, InvoiceStatus, InvoiceType, LineType } from "@/generated/prisma";
import { getOrgTaxMap } from "@/server/lib/tax-helpers";
import { resolveInvoiceTax } from "@/server/services/invoice-tax-resolver";
import { generateInvoiceNumber } from "@/server/services/invoice-numbering";
import { generatePortalToken } from "@/lib/portal-session";
import { assertInOrg } from "@/server/lib/get-for-org";
```

Add the wizard line schema near the top (after imports):

```ts
const wizardLineSchema = z.object({
  name: z.string().min(1),
  qty: z.number().default(1),
  rate: z.number().default(0),
  sourceId: z.string().optional(), // org Item id, for traceability
});
```

Add the procedure after `generateDraft`. NOTE: this deliberately mirrors the ESTIMATE subset of `invoices.create` (numbering, portal token, tax-resolved totals). If you change the money math in one, change it in the other.

```ts
  // Wizard entry point: create the backing ESTIMATE + its ProposalContent in one
  // transaction. Scoped duplicate of invoices.create's estimate path (no partial
  // payments / credit balance / recurring) — keep money math in sync with invoices.create.
  createFromWizard: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        clientId: z.string().min(1),
        projectId: z.string().nullable().optional(),
        templateId: z.string().optional(),
        sections: proposalSectionsSchema,
        lineItems: z.array(wizardLineSchema).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: {
          id: true, stripeTaxEnabled: true, addressLine1: true, addressLine2: true,
          city: true, state: true, postalCode: true, country: true,
        },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      await assertInOrg(ctx.db.client, input.clientId, ctx.orgId, { entityName: "Client" });
      if (input.projectId) {
        await assertInOrg(ctx.db.project, input.projectId, ctx.orgId, { entityName: "Project" });
      }

      // Org default currency, mirroring InvoiceForm's currencies[0] fallback.
      const currency =
        (await ctx.db.currency.findFirst({ where: { organizationId: ctx.orgId, isDefault: true } })) ??
        (await ctx.db.currency.findFirst({ where: { organizationId: ctx.orgId } }));
      if (!currency)
        throw new TRPCError({ code: "BAD_REQUEST", message: "No currency configured for this organization" });

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);
      const resolved = await resolveInvoiceTax({
        db: ctx.db as unknown as PrismaClient,
        org,
        clientId: input.clientId,
        currencyId: currency.id,
        lines: input.lineItems.map((l, i) => ({
          reference: String(i),
          qty: l.qty,
          rate: l.rate,
          period: undefined,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        })),
        discountType: null,
        discountAmount: 0,
        taxMap,
      });

      const invoiceId = await ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateInvoiceNumber(txClient, ctx.orgId);
        const created = await tx.invoice.create({
          data: {
            number,
            type: InvoiceType.ESTIMATE,
            status: InvoiceStatus.DRAFT,
            date: new Date(),
            currencyId: currency.id,
            exchangeRate: 1,
            // Intentionally NOT setting `notes` from a user-entered title: invoice.notes
            // renders on the client-facing estimate PDF (see pdf-templates/*.tsx), so a
            // free-text proposal title would leak. The proposal is identified by its
            // estimate number + client name in the list/detail views instead.
            clientId: input.clientId,
            projectId: input.projectId ?? null,
            organizationId: ctx.orgId,
            portalToken: generatePortalToken(),
            subtotal: resolved.invoice.subtotal,
            discountTotal: resolved.invoice.discountTotal,
            taxTotal: resolved.invoice.taxTotal,
            total: resolved.invoice.total,
            stripeTaxCalculationId: resolved.invoice.stripeTaxCalculationId,
            lines: {
              create: input.lineItems.map((line, i) => {
                const r = resolved.lines[i];
                return {
                  sort: i,
                  lineType: LineType.STANDARD,
                  name: line.name,
                  qty: line.qty,
                  rate: line.rate,
                  discount: 0,
                  discountIsPercentage: false,
                  sourceTable: line.sourceId ? "Item" : undefined,
                  sourceId: line.sourceId,
                  subtotal: r.subtotal,
                  taxTotal: r.taxTotal,
                  total: r.total,
                  taxes: { create: r.legacyTaxBreakdown },
                  stripeTaxBreakdown: { create: r.stripeTaxBreakdown },
                };
              }),
            },
          },
        });

        await tx.proposalContent.create({
          data: {
            invoiceId: created.id,
            organizationId: ctx.orgId,
            templateId: input.templateId ?? null,
            sections: input.sections as Prisma.InputJsonValue,
            version: "1.0",
          },
        });

        return created.id;
      });

      return { invoiceId };
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/proposals-create-from-wizard.router.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/proposals.ts src/test/proposals-create-from-wizard.router.test.ts
git commit -m "feat(proposals): createFromWizard creates estimate + proposal transactionally"
```

---

## Task 3: Add `deriveProposalStatus` helper + `proposals.list`

**Files:**
- Create: `src/server/routers/proposals-helpers.ts`
- Modify: `src/server/routers/proposals.ts`
- Test: `src/test/proposals-helpers.status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/proposals-helpers.status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveProposalStatus } from "@/server/routers/proposals-helpers";

describe("deriveProposalStatus", () => {
  const base = { hasContent: true, invoiceStatus: "DRAFT", lastSent: null, signedAt: null, hasOpenEvent: false };

  it("returns 'none' when there is no proposal content or file", () => {
    expect(deriveProposalStatus({ ...base, hasContent: false })).toBe("none");
  });

  it("returns 'draft' when content exists but it was never sent", () => {
    expect(deriveProposalStatus(base)).toBe("draft");
  });

  it("returns 'sent' when sent but not opened or signed", () => {
    expect(deriveProposalStatus({ ...base, invoiceStatus: "SENT", lastSent: new Date() })).toBe("sent");
  });

  it("returns 'viewed' when an open event exists and it is unsigned", () => {
    expect(deriveProposalStatus({ ...base, invoiceStatus: "SENT", lastSent: new Date(), hasOpenEvent: true })).toBe("viewed");
  });

  it("returns 'signed' when signedAt is set, regardless of open events", () => {
    expect(deriveProposalStatus({ ...base, signedAt: new Date(), hasOpenEvent: true })).toBe("signed");
  });

  it("returns 'signed' when the estimate status is ACCEPTED", () => {
    expect(deriveProposalStatus({ ...base, invoiceStatus: "ACCEPTED" })).toBe("signed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/proposals-helpers.status.test.ts`
Expected: FAIL — cannot find module `proposals-helpers`.

- [ ] **Step 3: Implement the helper**

Create `src/server/routers/proposals-helpers.ts`:

```ts
export type ProposalStatus = "none" | "draft" | "sent" | "viewed" | "signed";

/**
 * Derive a proposal's lifecycle status from its backing estimate. Mirrors the
 * signals ProposalEngagementPanel already uses: signedAt / ACCEPTED status win,
 * then an "email.opened" event marks "viewed", then a send marks "sent".
 */
export function deriveProposalStatus(input: {
  hasContent: boolean;
  invoiceStatus: string;
  lastSent: Date | null;
  signedAt: Date | null;
  hasOpenEvent: boolean;
}): ProposalStatus {
  if (input.signedAt || input.invoiceStatus === "ACCEPTED") return "signed";
  if (!input.hasContent) return "none";
  if (input.hasOpenEvent) return "viewed";
  if (input.lastSent || input.invoiceStatus === "SENT") return "sent";
  return "draft";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/proposals-helpers.status.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add `proposals.list` procedure**

In `src/server/routers/proposals.ts`, import the helper:

```ts
import { deriveProposalStatus } from "./proposals-helpers";
```

Add the procedure to the router (place it first, before `get`):

```ts
  list: protectedProcedure.query(async ({ ctx }) => {
    const estimates = await ctx.db.invoice.findMany({
      where: { organizationId: ctx.orgId, type: "ESTIMATE", isArchived: false },
      select: {
        id: true,
        number: true,
        notes: true,
        status: true,
        total: true,
        lastSent: true,
        signedAt: true,
        updatedAt: true,
        currency: { select: { code: true, symbol: true } },
        client: { select: { name: true } },
        proposalContent: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // One grouped lookup for "opened" events across all estimates (avoids N+1).
    const ids = estimates.map((e) => e.id);
    const openEvents = ids.length
      ? await ctx.db.emailEvent.findMany({
          where: { organizationId: ctx.orgId, type: "email.opened", invoiceId: { in: ids } },
          select: { invoiceId: true },
        })
      : [];
    const openedIds = new Set(openEvents.map((e) => e.invoiceId));

    return estimates.map((e) => ({
      id: e.id,
      number: e.number,
      title: e.notes ?? null,
      clientName: e.client.name,
      value: Number(e.total),
      currencyCode: e.currency?.code ?? null,
      currencySymbol: e.currency?.symbol ?? null,
      lastActivity: e.updatedAt,
      status: deriveProposalStatus({
        hasContent: e.proposalContent != null,
        invoiceStatus: e.status,
        lastSent: e.lastSent,
        signedAt: e.signedAt,
        hasOpenEvent: openedIds.has(e.id),
      }),
    }));
  }),
```

> If TypeScript reports `proposalContent` or `currency` is not a valid relation on `Invoice`, confirm the relation field names in `prisma/schema.prisma` (model `Invoice`) and adjust the `select`. `ProposalContent.invoice` back-relation and the `currency` relation both exist.

- [ ] **Step 6: Run the full proposals test set**

Run: `npx vitest run src/test/proposals-helpers.status.test.ts src/test/proposals-generate.router.test.ts src/test/proposals-generate-draft.router.test.ts src/test/proposals-create-from-wizard.router.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/proposals.ts src/server/routers/proposals-helpers.ts src/test/proposals-helpers.status.test.ts
git commit -m "feat(proposals): proposals.list with lifecycle status derivation"
```

---

## Task 4: Extract `ProposalSectionsEditor`

**Files:**
- Create: `src/components/proposals/ProposalSectionsEditor.tsx`
- Modify: `src/components/invoices/ProposalEditor.tsx`

- [ ] **Step 1: Create the presentational editor**

Create `src/components/proposals/ProposalSectionsEditor.tsx` (lifts the section-rendering body of `ProposalEditor`; operates on controlled props, no data fetching):

```tsx
"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import { Button } from "@/components/ui/button";
import { Eye, Pencil } from "lucide-react";

export type ProposalSection = { key: string; title: string; content: string | null };

export function ProposalSectionsEditor({
  sections,
  onChange,
}: {
  sections: ProposalSection[];
  onChange: (next: ProposalSection[]) => void;
}) {
  const [previewing, setPreviewing] = useState<string | null>(null);

  function updateSection(index: number, content: string) {
    onChange(sections.map((s, i) => (i === index ? { ...s, content } : s)));
  }

  return (
    <>
      {sections.map((section, i) => (
        <div key={section.key} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>{section.title}</Label>
            {section.key !== "budget" && section.content && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewing(previewing === section.key ? null : section.key)}
              >
                {previewing === section.key ? (
                  <><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</>
                ) : (
                  <><Eye className="h-3.5 w-3.5 mr-1.5" />Preview</>
                )}
              </Button>
            )}
          </div>
          {section.key === "budget" ? (
            <p className="text-sm text-muted-foreground">Auto-generated from estimate line items.</p>
          ) : previewing === section.key ? (
            <MarkdownPreview content={section.content ?? ""} />
          ) : (
            <Textarea
              rows={6}
              value={section.content ?? ""}
              onChange={(e) => updateSection(i, e.target.value)}
              placeholder="Supports **bold**, ## headings, - bullets, and | tables |"
            />
          )}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Rewire `ProposalEditor` to use it**

In `src/components/invoices/ProposalEditor.tsx`: remove the local `Textarea`/`Label`/`MarkdownPreview`/`Eye`/`Pencil` imports and the `previewing` state and the `updateSection` function and the inline `sections.map(...)` block. Import and render the shared editor instead.

Replace the `import` block lines for those UI bits with:

```tsx
import { ProposalSectionsEditor, type ProposalSection } from "@/components/proposals/ProposalSectionsEditor";
```

(Keep the `Button`, `Download`, `Trash2` imports — they're still used in the header.) Delete `Textarea`, `Label`, `MarkdownPreview`, `Eye`, `Pencil` imports and the local `type Section` (use the imported `ProposalSection`). Replace the `{sections.map(...)}` JSX block (the whole `sections.map` through its closing `))}`) with:

```tsx
      <ProposalSectionsEditor sections={sections} onChange={setSections} />
```

Remove the now-unused `previewing` state line and the `updateSection` function. The `sections` state type becomes `ProposalSection[]`.

- [ ] **Step 3: Verify nothing else broke (typecheck + existing tests)**

Run: `npx tsc --noEmit && npx vitest run src/test/proposal-templates-helpers.test.ts`
Expected: typecheck passes; proposal-template tests pass. (No dedicated `ProposalEditor` test exists; the typecheck guards the refactor.)

- [ ] **Step 4: Commit**

```bash
git add src/components/proposals/ProposalSectionsEditor.tsx src/components/invoices/ProposalEditor.tsx
git commit -m "refactor(proposals): extract shared ProposalSectionsEditor"
```

---

## Task 5: Add Proposals to navigation

**Files:**
- Modify: `src/components/layout/SidebarNav.tsx`
- Modify: `src/components/layout/MobileNav.tsx`

- [ ] **Step 1: Add to the sidebar primary nav**

In `src/components/layout/SidebarNav.tsx`, add `FileText` to the lucide-react import block, then add the item to `primaryNav` directly after the Invoices entry:

```tsx
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/proposals", label: "Proposals", icon: FileText },
```

> Note: the active-state check is `pathname.startsWith(item.href)`. `/proposals` and `/invoices` are distinct prefixes, so no cross-highlight. Good.

- [ ] **Step 2: Add to the mobile nav**

In `src/components/layout/MobileNav.tsx`, add `FileText` to the lucide import block. The bottom tab bar (`tabs`) is space-constrained — do NOT add a 6th primary tab. Instead add Proposals to the overflow/"More" menu list where the secondary items (Projects, Timesheets, Reports, etc.) live.

Locate the array of secondary/overflow nav items in this file (the list rendered behind the `MoreHorizontal` "More" sheet) and add, right after the Invoices entry:

```tsx
  { href: "/proposals", label: "Proposals", icon: FileText },
```

> If the file has no separate overflow array (only the 5-item `tabs`), add a `moreLinks`-style entry consistent with how `/projects`, `/timesheets`, and `/reports` are already surfaced in the More sheet. Match the existing structure exactly — read the file first.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/SidebarNav.tsx src/components/layout/MobileNav.tsx
git commit -m "feat(proposals): surface Proposals in sidebar and mobile nav"
```

---

## Task 6: `/proposals` list route + `ProposalList` component

**Files:**
- Create: `src/components/proposals/ProposalList.tsx`
- Create: `src/app/(dashboard)/proposals/page.tsx`

- [ ] **Step 1: Create the list component**

Create `src/components/proposals/ProposalList.tsx`:

```tsx
import Link from "next/link";
import type { ProposalStatus } from "@/server/routers/proposals-helpers";

const STATUS_BADGE: Record<ProposalStatus, { label: string; className: string }> = {
  none: { label: "No draft", className: "bg-muted text-muted-foreground" },
  draft: { label: "Draft", className: "bg-amber-50 text-amber-700" },
  sent: { label: "Sent", className: "bg-blue-50 text-blue-700" },
  viewed: { label: "Viewed", className: "bg-emerald-50 text-emerald-700" },
  signed: { label: "Signed", className: "bg-primary/10 text-primary" },
};

type Row = {
  id: string;
  number: string;
  title: string | null;
  clientName: string;
  value: number;
  currencySymbol: string | null;
  lastActivity: Date | string;
  status: ProposalStatus;
};

export function ProposalList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">No proposals yet.</p>
        <Link href="/proposals/new" className="mt-3 inline-block text-sm font-medium text-primary">
          Create your first proposal →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">Client</th>
            <th className="px-4 py-3 text-left">Proposal</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">Value</th>
            <th className="px-4 py-3 text-right">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = STATUS_BADGE[r.status];
            return (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/proposals/${r.id}`} className="font-medium hover:underline">
                    {r.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.title ?? r.number}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.currencySymbol ?? ""}{r.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {new Date(r.lastActivity).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create the route**

Create `src/app/(dashboard)/proposals/page.tsx`:

```tsx
import Link from "next/link";
import { api } from "@/trpc/server";
import { ProposalList } from "@/components/proposals/ProposalList";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function ProposalsPage() {
  const rows = await api.proposals.list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Proposals</h1>
          <p className="text-sm text-muted-foreground">Draft, send, and track client proposals.</p>
        </div>
        <Button asChild>
          <Link href="/proposals/new">
            <Plus className="mr-2 h-4 w-4" />
            New Proposal
          </Link>
        </Button>
      </div>
      <ProposalList rows={rows} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes. (`api.proposals.list` is now typed from Task 3.)

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/proposals/page.tsx src/components/proposals/ProposalList.tsx
git commit -m "feat(proposals): proposals list page"
```

---

## Task 7: `/proposals/new` wizard

**Files:**
- Create: `src/components/proposals/ProposalWizard.tsx`
- Create: `src/app/(dashboard)/proposals/new/page.tsx`

- [ ] **Step 1: Create the wizard component**

Create `src/components/proposals/ProposalWizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ProposalSectionsEditor, type ProposalSection } from "@/components/proposals/ProposalSectionsEditor";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

type Client = { id: string; name: string };
type Project = { id: string; name: string; clientId: string };
type Template = { id: string; name: string; isDefault: boolean; sections: ProposalSection[] };
type SuggestedItem = { itemId: string; name: string; quantity: number; rate: number };

export function ProposalWizard({
  clients, projects, templates,
}: {
  clients: Client[];
  projects: Project[];
  templates: Template[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [templateId, setTemplateId] = useState(templates.find((t) => t.isDefault)?.id ?? "");
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [items, setItems] = useState<(SuggestedItem & { accepted: boolean })[]>([]);

  const clientProjects = projects.filter((p) => p.clientId === clientId);

  // The chosen template (explicit, else org default) — the scaffold both the AI
  // path conforms to and the AI-unavailable path falls back to.
  function resolveTemplate(): Template | undefined {
    return templates.find((t) => t.id === templateId) ?? templates.find((t) => t.isDefault);
  }

  const generate = trpc.proposals.generateDraft.useMutation({
    onSuccess: (res) => {
      if (!res.draft) {
        // AI off/invalid: proceed with the template's own sections (matches the
        // spec's "plain template" fallback), not an empty editor.
        const tmpl = resolveTemplate();
        if (!tmpl) {
          toast.error("No template available — create one in Settings → Proposals.");
          return; // stay on step 1; nothing to edit
        }
        toast.message("AI is unavailable — starting from the template.");
        setSections(tmpl.sections.map((s) => ({ ...s })));
        setItems([]);
      } else {
        setSections(res.draft.sections as ProposalSection[]);
        setItems(res.draft.suggestedItems.map((i) => ({ ...i, accepted: true })));
      }
      setStep(2);
    },
    onError: (err) => toast.error(err.message),
  });

  const create = trpc.proposals.createFromWizard.useMutation({
    onSuccess: ({ invoiceId }) => {
      toast.success("Proposal created");
      router.push(`/proposals/${invoiceId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleGenerate() {
    generate.mutate({
      clientId,
      projectId: projectId || undefined,
      templateId: templateId || undefined,
    });
  }

  function handleSave() {
    create.mutate({
      clientId,
      projectId: projectId || null,
      templateId: templateId || undefined,
      sections: sections.map((s) => ({ key: s.key, title: s.title, content: s.content ?? "" })),
      lineItems: items.filter((i) => i.accepted).map((i) => ({
        name: i.name, qty: i.quantity, rate: i.rate, sourceId: i.itemId,
      })),
    });
  }

  if (step === 1) {
    return (
      <div className="max-w-xl space-y-5">
        <div className="space-y-1.5">
          <Label>Client</Label>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId(""); }}>
            <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {clientProjects.length > 0 && (
          <div className="space-y-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
              <SelectContent>
                {clientProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Template (optional)</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Org default" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleGenerate} disabled={!clientId || generate.isPending}>
          <Sparkles className="mr-2 h-4 w-4" />
          {generate.isPending ? "Generating…" : "Generate with AI"}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-4 rounded-lg border p-4">
        <ProposalSectionsEditor sections={sections} onChange={setSections} />
      </div>

      {items.length > 0 && (
        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Suggested line items</h3>
          {items.map((it, i) => (
            <label key={it.itemId} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={it.accepted}
                  onChange={(e) => setItems((prev) => prev.map((p, j) => j === i ? { ...p, accepted: e.target.checked } : p))}
                />
                {it.name}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Input
                  type="number"
                  className="h-8 w-20"
                  value={it.quantity}
                  onChange={(e) => setItems((prev) => prev.map((p, j) => j === i ? { ...p, quantity: Number(e.target.value) } : p))}
                />
                × {it.rate.toFixed(2)}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
        <Button onClick={handleSave} disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Save proposal"}
        </Button>
      </div>
    </div>
  );
}
```

> Note on the AI-unavailable branch: when `draft` is null the wizard loads the chosen/default template's `sections` (passed in via the `templates` prop) into the editor — matching the spec's "proceeds with plain template sections" fallback. If no template exists at all, it shows an error toast and stays on step 1 (nothing to edit). This keeps the `{ draft: null }` contract of `generateDraft` unchanged.

- [ ] **Step 2: Create the route**

Create `src/app/(dashboard)/proposals/new/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import { ProposalWizard } from "@/components/proposals/ProposalWizard";

export default async function NewProposalPage() {
  const [clientsResult, projectsResult, templates] = await Promise.all([
    api.clients.list({ includeArchived: false, pageSize: 100 }),
    api.projects.list({ includeArchived: false, pageSize: 100 }),
    api.proposalTemplates.list(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Proposal</h1>
        <p className="text-sm text-muted-foreground">Pick a client, then let AI draft the proposal.</p>
      </div>
      <ProposalWizard
        clients={clientsResult.items.map((c) => ({ id: c.id, name: c.name }))}
        projects={projectsResult.items.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          isDefault: t.isDefault,
          sections: t.sections as { key: string; title: string; content: string }[],
        }))}
      />
    </div>
  );
}
```

> Confirmed shapes (no further verification needed): `api.clients.list` and `api.projects.list` both return `{ items, total }`; project rows expose `clientId` as a scalar. `pageSize: 100` avoids default-page truncation. `api.proposalTemplates.list()` returns the template array directly.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes. Fix any field-name mismatches surfaced for `projects.list` / `clients.list` shapes.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/proposals/new/page.tsx src/components/proposals/ProposalWizard.tsx
git commit -m "feat(proposals): AI creation wizard"
```

---

## Task 8: `/proposals/[id]` thin detail wrapper

**Files:**
- Create: `src/app/(dashboard)/proposals/[id]/page.tsx`

- [ ] **Step 1: Create the detail route**

Create `src/app/(dashboard)/proposals/[id]/page.tsx`. It reuses the existing `ProposalSection` and `ProposalEngagementPanel` client components. Mirror how `invoices/[id]/page.tsx` fetches the estimate and reads `lastSent`/`signedAt`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/trpc/server";
import { ProposalSection } from "@/components/invoices/ProposalSection";
import { ProposalEngagementPanel } from "@/components/invoices/ProposalEngagementPanel";
import { SendInvoiceButton } from "@/components/invoices/SendInvoiceButton";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const invoice = await api.invoices.get({ id }).catch(() => null);
  if (!invoice || invoice.type !== "ESTIMATE") notFound();

  const value = Number(invoice.total);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{invoice.client.name}</p>
          <h1 className="text-2xl font-semibold">Proposal {invoice.number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.currency?.symbol ?? ""}{value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Same send action the invoice page uses for estimates (see invoices/[id]/page.tsx:140). */}
          <SendInvoiceButton invoiceId={invoice.id} clientId={invoice.client.id} />
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/invoices/${invoice.id}/proposal-pdf`} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />PDF
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/invoices/${invoice.id}`}>
              <ExternalLink className="mr-2 h-4 w-4" />Open as estimate
            </Link>
          </Button>
        </div>
      </div>

      <ProposalSection invoiceId={invoice.id} />

      <ProposalEngagementPanel
        invoiceId={invoice.id}
        hasSent={invoice.lastSent != null}
        signedAt={invoice.signedAt}
      />
    </div>
  );
}
```

> Before running: open `src/app/(dashboard)/invoices/[id]/page.tsx` and copy the EXACT props it passes to `ProposalEngagementPanel` (line ~558–562: `hasSent`, `signedAt`) and `SendInvoiceButton` (line ~140: `invoiceId`, `clientId`, optional `autoSend`), plus how it reads `invoice.currency`, `invoice.total`, `invoice.client.id`, `invoice.client.name`. Match `api.invoices.get`'s actual return shape (it uses `detailInvoiceInclude`); adjust field accessors if names differ. The "Open as estimate" link and PDF href are the only net-new bits.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes. Fix field accessors to match `api.invoices.get`'s real shape.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, then:
1. Sidebar shows **Proposals**; click it → `/proposals` renders (empty state or existing estimates).
2. **New Proposal** → pick a client → **Generate with AI** → lands on step 2 with sections (and items if `GEMINI_API_KEY` set; empty + toast if not).
3. **Save proposal** → redirects to `/proposals/<id>` showing the section editor + engagement panel.
4. The new proposal appears in `/proposals` with a status badge.

Expected: all four pass.

- [ ] **Step 4: Run the full test suite + lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/proposals/\[id\]/page.tsx
git commit -m "feat(proposals): thin proposal detail wrapper"
```

---

## Self-Review Notes

- **Spec coverage:** nav (Task 5), proposals-centric list (Tasks 3, 6), wizard with AI + suggested items + create-on-save (Tasks 1, 2, 7), thin detail wrapper with PDF + **Send** + Open-as-estimate (Task 8), shared editor extraction (Task 4), error/edge cases (template-missing → BAD_REQUEST in Task 1; currency-missing → BAD_REQUEST in Task 2; AI-unconfigured → template-section fallback in Tasks 1 & 7; non-estimate id → notFound in Task 8). Tests for all three new procedures + the status helper.
- **Deviation from spec (title field):** the spec's `createFromWizard` input had an optional `title` stored in `invoice.notes`. Dropped for v1 — `invoice.notes` renders on the client-facing estimate PDF (`pdf-templates/*.tsx`), so a free-text title would leak to the client. Proposals are identified by estimate number + client name in the list/detail. Revisit only if a dedicated, non-client-facing title column is added to `ProposalContent` (a schema change, out of scope here).
- **Permissions:** `generateDraft` and `createFromWizard` both `OWNER/ADMIN` (matches `invoices.create`; no accountant dead-end).
- **Deliberate duplication:** `createFromWizard` re-implements the ESTIMATE subset of `invoices.create` (flagged with a sync comment) rather than refactoring the money path — lower risk per design.
- **Type consistency:** `ProposalSection` type is shared from `ProposalSectionsEditor`; `ProposalStatus` shared from `proposals-helpers`; suggested-item shape `{ itemId, name, quantity, rate }` (from `GroundedLineItem`) is mapped to wizard line `{ name, qty, rate, sourceId }` in Task 7's `handleSave`.
- **Verify-before-coding flags:** Tasks 6–8 each carry a "confirm the real shape" note for `projects.list`, `clients.list`, and `api.invoices.get` return fields — these are the only spots where exact property names weren't locked at plan time.

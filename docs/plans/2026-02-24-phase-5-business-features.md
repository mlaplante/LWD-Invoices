# Phase 5 — Business Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the full Pancake v2 feature set with recurring invoices, reports, estimate workflow, credit notes, file attachments, notifications, audit log, support tickets, discussion threads, and public REST API v1.

**Architecture:** Each feature follows the established pattern: Prisma schema → tRPC router → React component. New models are scoped to `organizationId`. Inngest handles background jobs for recurring invoices. File uploads use `@vercel/blob`. Notifications and audit logs are created as side effects inside tRPC mutations.

**Tech Stack:** Next.js 16 App Router, tRPC v11, Prisma 7 (PrismaPg), Inngest, @vercel/blob, Vitest, shadcn/ui, Tailwind v4, Resend/React Email

---

## Reference: Established Patterns

Before writing any code, internalize these patterns from the existing codebase:

**tRPC protected procedure:**
```typescript
// src/server/routers/example.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const exampleRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.example.findMany({ where: { organizationId: org.id } });
  }),
});
```

**Register router in `_app.ts`:**
```typescript
import { exampleRouter } from "./example";
export const appRouter = router({ ...existing, example: exampleRouter });
```

**Prisma schema field pattern:** All org-scoped models include:
```prisma
organizationId String
organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
```

**Decimal type in TypeScript:** `import type { Prisma } from "@/generated/prisma"; type Decimal = Prisma.Decimal;`

**Client component with tRPC:** Import `trpc` from `@/trpc/client`, use `trpc.router.procedure.useQuery()` / `.useMutation()`

---

## Task 1: Vitest Setup

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json` (add scripts + devDeps)

**Step 1: Install Vitest and test utilities**
```bash
cd /Users/mlaplante/Sites/pancake/v2
npm install --save-dev vitest @vitest/coverage-v8
```

**Step 2: Create vitest config**
```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

**Step 3: Create test setup file**
```typescript
// src/test/setup.ts
// Global test setup — add mocks here as needed
```

**Step 4: Add test script to package.json**
```json
"scripts": {
  "test": "vitest",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage"
}
```

**Step 5: Verify with a smoke test**
```typescript
// src/test/smoke.test.ts
describe("vitest setup", () => {
  it("runs", () => expect(1 + 1).toBe(2));
});
```
Run: `npm run test:run`
Expected: 1 test passes

**Step 6: Commit**
```bash
git add vitest.config.ts src/test/ package.json
git commit -m "chore: add Vitest test infrastructure"
```

---

## Task 2: Schema Additions

**Files:**
- Modify: `prisma/schema.prisma`

Add all new models at once. Run `npx prisma db push` to sync.

**Step 1: Add enums to schema.prisma** (after existing enums section)
```prisma
enum RecurringFrequency {
  DAILY
  WEEKLY
  MONTHLY
  YEARLY
}

enum AttachmentContext {
  INVOICE
  PROJECT
  CLIENT
  TICKET
}

enum NotificationType {
  INVOICE_SENT
  INVOICE_VIEWED
  INVOICE_PAID
  INVOICE_OVERDUE
  INVOICE_COMMENT
  ESTIMATE_ACCEPTED
  ESTIMATE_REJECTED
  RECURRING_INVOICE_GENERATED
  TICKET_CREATED
  TICKET_REPLIED
}

enum AuditAction {
  CREATED
  UPDATED
  DELETED
  STATUS_CHANGED
  PAYMENT_RECEIVED
  SENT
  VIEWED
}

enum TicketPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}
```

**Step 2: Add new models** (after Expense model at end of schema)
```prisma
// ─── Recurring Invoices ───────────────────────────────────────────────────────

model RecurringInvoice {
  id              String             @id @default(cuid())
  frequency       RecurringFrequency
  interval        Int                @default(1)
  startDate       DateTime
  nextRunAt       DateTime
  endDate         DateTime?
  maxOccurrences  Int?
  occurrenceCount Int                @default(0)
  isActive        Boolean            @default(true)
  autoSend        Boolean            @default(false)

  invoiceId      String       @unique
  invoice        Invoice      @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── Credit Note Applications ─────────────────────────────────────────────────

model CreditNoteApplication {
  id     String  @id @default(cuid())
  amount Decimal @db.Decimal(20, 10)

  creditNoteId   String
  creditNote     Invoice      @relation("CreditNoteSource", fields: [creditNoteId], references: [id])
  invoiceId      String
  invoice        Invoice      @relation("CreditNoteTarget", fields: [invoiceId], references: [id])
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
}

// ─── File Attachments ─────────────────────────────────────────────────────────

model Attachment {
  id           String            @id @default(cuid())
  filename     String
  originalName String
  mimeType     String
  size         Int
  storageUrl   String
  context      AttachmentContext
  contextId    String
  uploadedById String?

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
}

// ─── Notifications ────────────────────────────────────────────────────────────

model Notification {
  id     String           @id @default(cuid())
  type   NotificationType
  title  String
  body   String
  isRead Boolean          @default(false)
  link   String?
  userId String

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

model AuditLog {
  id          String      @id @default(cuid())
  action      AuditAction
  entityType  String
  entityId    String
  entityLabel String?
  diff        Json?
  userId      String?
  userLabel   String?

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
}

// ─── Support Tickets ──────────────────────────────────────────────────────────

model Ticket {
  id       String         @id @default(cuid())
  number   Int
  subject  String
  status   TicketStatus   @default(OPEN)
  priority TicketPriority @default(NORMAL)

  clientId     String?
  client       Client?         @relation(fields: [clientId], references: [id])
  assignedToId String?
  messages     TicketMessage[]

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([organizationId, number])
}

model TicketMessage {
  id         String  @id @default(cuid())
  body       String
  isStaff    Boolean @default(true)
  authorId   String?
  authorName String?

  ticketId String
  ticket   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
}

// ─── Project Discussions ──────────────────────────────────────────────────────

model Discussion {
  id      String              @id @default(cuid())
  subject String
  body    String
  isStaff Boolean             @default(true)
  authorId String?
  authorName String?

  projectId      String
  project        Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  replies        DiscussionReply[]

  createdAt DateTime @default(now())
}

model DiscussionReply {
  id         String  @id @default(cuid())
  body       String
  isStaff    Boolean @default(true)
  authorId   String?
  authorName String?

  discussionId String
  discussion   Discussion @relation(fields: [discussionId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
}
```

**Step 3: Add relations to existing models**

In `Organization` model, add these relations at the end of the relations list:
```prisma
  recurringInvoices       RecurringInvoice[]
  creditNoteApplications  CreditNoteApplication[]
  attachments             Attachment[]
  notifications           Notification[]
  auditLogs               AuditLog[]
  tickets                 Ticket[]
  discussions             Discussion[]
```

In `Invoice` model, add after `comments` relation:
```prisma
  recurringInvoice        RecurringInvoice?
  creditNotesIssued       CreditNoteApplication[] @relation("CreditNoteSource")
  creditNotesReceived     CreditNoteApplication[] @relation("CreditNoteTarget")
```

In `Client` model, add after `projects` relation:
```prisma
  tickets                 Ticket[]
```

In `Project` model, add after `expenses` relation:
```prisma
  discussions             Discussion[]
```

**Step 4: Push schema to database**
```bash
cd /Users/mlaplante/Sites/pancake/v2
npx prisma db push
npx prisma generate
```
Expected: "Your database is now in sync with your Prisma schema."

**Step 5: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add Phase 5 models — recurring invoices, attachments, notifications, audit log, tickets, discussions"
```

---

## Task 3: Recurring Invoices — Inngest Setup

**Files:**
- Create: `src/inngest/client.ts`
- Create: `src/inngest/functions/recurring-invoices.ts`
- Create: `src/app/api/inngest/route.ts`
- Modify: `src/lib/env.ts`

**Step 1: Install Inngest**
```bash
npm install inngest
```

**Step 2: Write failing test for `computeNextRunAt`**
```typescript
// src/test/recurring.test.ts
import { describe, it, expect } from "vitest";
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";

describe("computeNextRunAt", () => {
  it("advances daily by 1 day", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "DAILY", 1);
    expect(result.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });
  it("advances weekly by 7 days", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "WEEKLY", 1);
    expect(result.toISOString()).toBe("2026-03-08T00:00:00.000Z");
  });
  it("advances monthly by 1 month", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "MONTHLY", 1);
    expect(result.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
  it("advances yearly by 1 year", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "YEARLY", 1);
    expect(result.toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });
  it("respects interval > 1", () => {
    const base = new Date("2026-03-01T00:00:00Z");
    const result = computeNextRunAt(base, "MONTHLY", 3);
    expect(result.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});
```

Run: `npm run test:run -- src/test/recurring.test.ts`
Expected: FAIL — "computeNextRunAt is not a function"

**Step 3: Create Inngest client**
```typescript
// src/inngest/client.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "pancake" });
```

**Step 4: Create the recurring invoices Inngest function**
```typescript
// src/inngest/functions/recurring-invoices.ts
import { inngest } from "../client";
import { db } from "@/server/db";
import { RecurringFrequency } from "@/generated/prisma";

export function computeNextRunAt(
  from: Date,
  frequency: RecurringFrequency,
  interval: number,
): Date {
  const d = new Date(from);
  switch (frequency) {
    case "DAILY":
      d.setUTCDate(d.getUTCDate() + interval);
      break;
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + interval * 7);
      break;
    case "MONTHLY":
      d.setUTCMonth(d.getUTCMonth() + interval);
      break;
    case "YEARLY":
      d.setUTCFullYear(d.getUTCFullYear() + interval);
      break;
  }
  return d;
}

export const processRecurringInvoices = inngest.createFunction(
  { id: "process-recurring-invoices", name: "Process Recurring Invoices" },
  { cron: "0 6 * * *" }, // daily at 6am UTC
  async () => {
    const now = new Date();

    const due = await db.recurringInvoice.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
      include: {
        invoice: {
          include: {
            lines: { include: { taxes: true } },
            currency: true,
          },
        },
        organization: true,
      },
    });

    const results = await Promise.allSettled(
      due.map((rec) => generateRecurringInvoice(rec)),
    );

    return {
      processed: due.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  },
);

async function generateRecurringInvoice(
  rec: Awaited<ReturnType<typeof db.recurringInvoice.findMany>>[0],
) {
  const template = rec.invoice;

  // Clone the invoice
  const newInvoice = await db.$transaction(async (tx) => {
    // Get next invoice number
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: rec.organizationId },
    });
    const number = `${org.invoicePrefix}-${String(org.invoiceNextNumber).padStart(4, "0")}`;
    await tx.organization.update({
      where: { id: org.id },
      data: { invoiceNextNumber: { increment: 1 } },
    });

    const invoice = await tx.invoice.create({
      data: {
        number,
        type: template.type,
        status: rec.autoSend ? "SENT" : "DRAFT",
        date: new Date(),
        dueDate: template.dueDate
          ? new Date(Date.now() + (template.dueDate.getTime() - template.date.getTime()))
          : undefined,
        currencyId: template.currencyId,
        exchangeRate: template.exchangeRate,
        simpleAmount: template.simpleAmount,
        notes: template.notes,
        subtotal: template.subtotal,
        discountTotal: template.discountTotal,
        taxTotal: template.taxTotal,
        total: template.total,
        clientId: template.clientId,
        organizationId: template.organizationId,
      },
    });

    // Clone lines
    for (const line of template.lines) {
      const newLine = await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          sort: line.sort,
          lineType: line.lineType,
          name: line.name,
          description: line.description,
          qty: line.qty,
          rate: line.rate,
          period: line.period,
          discount: line.discount,
          discountIsPercentage: line.discountIsPercentage,
          subtotal: line.subtotal,
          taxTotal: line.taxTotal,
          total: line.total,
        },
      });
      for (const lineTax of line.taxes) {
        await tx.invoiceLineTax.create({
          data: {
            invoiceLineId: newLine.id,
            taxId: lineTax.taxId,
            taxAmount: lineTax.taxAmount,
          },
        });
      }
    }

    return invoice;
  });

  // Update recurring config
  const maxReached =
    rec.maxOccurrences !== null &&
    rec.occurrenceCount + 1 >= rec.maxOccurrences;

  await db.recurringInvoice.update({
    where: { id: rec.id },
    data: {
      occurrenceCount: { increment: 1 },
      nextRunAt: computeNextRunAt(rec.nextRunAt, rec.frequency, rec.interval),
      isActive: !maxReached,
    },
  });

  // Create audit log
  await db.auditLog.create({
    data: {
      action: "CREATED",
      entityType: "Invoice",
      entityId: newInvoice.id,
      entityLabel: newInvoice.number,
      organizationId: rec.organizationId,
    },
  });

  return newInvoice;
}
```

**Step 5: Run tests to verify they pass**
```bash
npm run test:run -- src/test/recurring.test.ts
```
Expected: 5 tests pass

**Step 6: Create the Inngest API route**
```typescript
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processRecurringInvoices } from "@/inngest/functions/recurring-invoices";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processRecurringInvoices],
});
```

**Step 7: Add INNGEST_SIGNING_KEY to env.ts**
```typescript
// In server env vars, add:
INNGEST_SIGNING_KEY: z.string().min(1).optional(),
INNGEST_EVENT_KEY: z.string().min(1).optional(),
// In runtimeEnv, add:
INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
```

**Step 8: Add to .env.example**
```
INNGEST_SIGNING_KEY=
INNGEST_EVENT_KEY=
```

**Step 9: Commit**
```bash
git add src/inngest/ src/app/api/inngest/ src/lib/env.ts src/test/recurring.test.ts
git commit -m "feat(recurring): Inngest function for daily recurring invoice generation"
```

---

## Task 4: Recurring Invoices — tRPC Router

**Files:**
- Create: `src/server/routers/recurringInvoices.ts`
- Modify: `src/server/routers/_app.ts`

**Step 1: Create the router**
```typescript
// src/server/routers/recurringInvoices.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { RecurringFrequency } from "@/generated/prisma";

const recurringSchema = z.object({
  frequency: z.nativeEnum(RecurringFrequency),
  interval: z.number().int().min(1).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  autoSend: z.boolean().default(false),
});

export const recurringInvoicesRouter = router({
  getForInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.recurringInvoice.findUnique({
        where: { invoiceId: input.invoiceId },
      });
    }),

  upsert: protectedProcedure
    .input(z.object({ invoiceId: z.string(), data: recurringSchema }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify invoice belongs to org
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: org.id },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.recurringInvoice.upsert({
        where: { invoiceId: input.invoiceId },
        create: {
          ...input.data,
          invoiceId: input.invoiceId,
          organizationId: org.id,
          nextRunAt: input.data.startDate,
        },
        update: {
          ...input.data,
          nextRunAt: input.data.startDate,
        },
      });
    }),

  cancel: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.recurringInvoice.updateMany({
        where: { invoiceId: input.invoiceId, organizationId: org.id },
        data: { isActive: false },
      });
    }),
});
```

**Step 2: Register in _app.ts**
```typescript
import { recurringInvoicesRouter } from "./recurringInvoices";
// In appRouter:
recurringInvoices: recurringInvoicesRouter,
```

**Step 3: Commit**
```bash
git add src/server/routers/recurringInvoices.ts src/server/routers/_app.ts
git commit -m "feat(recurring): tRPC router for recurring invoice management"
```

---

## Task 5: Recurring Invoices — UI

**Files:**
- Create: `src/components/invoices/RecurringInvoiceDialog.tsx`
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx`

**Step 1: Create the dialog component**
```tsx
// src/components/invoices/RecurringInvoiceDialog.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RecurringFrequency } from "@/generated/prisma";

interface Props {
  invoiceId: string;
}

export function RecurringInvoiceDialog({ invoiceId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: existing } = trpc.recurringInvoices.getForInvoice.useQuery({ invoiceId });
  const utils = trpc.useUtils();

  const upsert = trpc.recurringInvoices.upsert.useMutation({
    onSuccess: () => {
      utils.recurringInvoices.getForInvoice.invalidate({ invoiceId });
      setOpen(false);
    },
  });

  const cancel = trpc.recurringInvoices.cancel.useMutation({
    onSuccess: () => {
      utils.recurringInvoices.getForInvoice.invalidate({ invoiceId });
    },
  });

  const [frequency, setFrequency] = useState<RecurringFrequency>(
    existing?.frequency ?? RecurringFrequency.MONTHLY,
  );
  const [interval, setInterval] = useState(existing?.interval ?? 1);
  const [startDate, setStartDate] = useState(
    existing?.startDate
      ? new Date(existing.startDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  );
  const [autoSend, setAutoSend] = useState(existing?.autoSend ?? false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      invoiceId,
      data: {
        frequency,
        interval,
        startDate: new Date(startDate),
        autoSend,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {existing?.isActive ? "Edit Recurring" : "Set Recurring"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recurring Invoice</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Daily</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="YEARLY">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Every</Label>
            <Input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={autoSend} onCheckedChange={setAutoSend} />
            <Label>Auto-send generated invoices</Label>
          </div>
          <div className="flex gap-2 justify-end">
            {existing?.isActive && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => cancel.mutate({ invoiceId })}
              >
                Cancel Recurring
              </Button>
            )}
            <Button type="submit" disabled={upsert.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Add Switch component (shadcn)**
```bash
npx shadcn@latest add switch
```

**Step 3: Add RecurringInvoiceDialog to invoice detail page**

In `src/app/(dashboard)/invoices/[id]/page.tsx`, import and add near the top action buttons:
```tsx
import { RecurringInvoiceDialog } from "@/components/invoices/RecurringInvoiceDialog";
// ...in the actions area:
<RecurringInvoiceDialog invoiceId={invoice.id} />
```

**Step 4: Commit**
```bash
git add src/components/invoices/RecurringInvoiceDialog.tsx src/app/\(dashboard\)/invoices/
git commit -m "feat(recurring): UI dialog for configuring recurring invoices"
```

---

## Task 6: Reports — tRPC Procedures

**Files:**
- Create: `src/server/routers/reports.ts`
- Modify: `src/server/routers/_app.ts`

**Step 1: Write failing tests**
```typescript
// src/test/reports.test.ts
import { describe, it, expect } from "vitest";

// Since reports router calls db, we test the date grouping helpers
import { groupByMonth } from "@/server/routers/reports";

describe("groupByMonth", () => {
  it("groups dates by month key", () => {
    const items = [
      { date: new Date("2026-01-15"), amount: 100 },
      { date: new Date("2026-01-28"), amount: 50 },
      { date: new Date("2026-02-10"), amount: 200 },
    ];
    const result = groupByMonth(items, (i) => i.date, (i) => i.amount);
    expect(result["2026-01"]).toBe(150);
    expect(result["2026-02"]).toBe(200);
  });
});
```

Run: `npm run test:run -- src/test/reports.test.ts`
Expected: FAIL — "groupByMonth is not a function"

**Step 2: Create the reports router**
```typescript
// src/server/routers/reports.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { InvoiceStatus } from "@/generated/prisma";

export function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => Date,
  getValue: (item: T) => number,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const d = getDate(item);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    result[key] = (result[key] ?? 0) + getValue(item);
  }
  return result;
}

const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const reportsRouter = router({
  unpaidInvoices: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.invoice.findMany({
        where: {
          organizationId: org.id,
          isArchived: false,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
          ...(input.from || input.to
            ? {
                date: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        include: { client: true, currency: true },
        orderBy: { dueDate: "asc" },
      });
    }),

  overdueInvoices: protectedProcedure
    .query(async ({ ctx }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.invoice.findMany({
        where: {
          organizationId: org.id,
          isArchived: false,
          status: InvoiceStatus.OVERDUE,
        },
        include: { client: true, currency: true },
        orderBy: { dueDate: "asc" },
      });
    }),

  paymentsByGateway: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const payments = await ctx.db.payment.findMany({
        where: {
          organizationId: org.id,
          ...(input.from || input.to
            ? {
                paidAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
      });

      const byGateway: Record<string, { count: number; total: number; fees: number }> = {};
      for (const p of payments) {
        const key = p.method;
        if (!byGateway[key]) byGateway[key] = { count: 0, total: 0, fees: 0 };
        byGateway[key].count++;
        byGateway[key].total += Number(p.amount);
        byGateway[key].fees += Number(p.gatewayFee);
      }
      return byGateway;
    }),

  expenseBreakdown: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.expense.findMany({
        where: {
          organizationId: org.id,
          ...(input.from || input.to
            ? {
                dueDate: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        include: {
          category: true,
          supplier: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  revenueByMonth: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const payments = await ctx.db.payment.findMany({
        where: {
          organizationId: org.id,
          ...(input.from || input.to
            ? {
                paidAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        select: { amount: true, paidAt: true },
      });

      return groupByMonth(
        payments,
        (p) => p.paidAt,
        (p) => Number(p.amount),
      );
    }),
});
```

**Step 3: Run tests**
```bash
npm run test:run -- src/test/reports.test.ts
```
Expected: 1 test passes

**Step 4: Register in _app.ts**
```typescript
import { reportsRouter } from "./reports";
// In appRouter:
reports: reportsRouter,
```

**Step 5: Commit**
```bash
git add src/server/routers/reports.ts src/server/routers/_app.ts src/test/reports.test.ts
git commit -m "feat(reports): tRPC procedures for unpaid, overdue, payments by gateway, expenses, revenue"
```

---

## Task 7: Reports — UI Pages

**Files:**
- Create: `src/app/(dashboard)/reports/page.tsx`
- Create: `src/app/(dashboard)/reports/unpaid/page.tsx`
- Create: `src/app/(dashboard)/reports/payments/page.tsx`
- Create: `src/app/(dashboard)/reports/expenses/page.tsx`

**Step 1: Create the reports index page**
```tsx
// src/app/(dashboard)/reports/page.tsx
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const reports = [
  { href: "/reports/unpaid", title: "Unpaid Invoices", description: "Outstanding invoices requiring payment" },
  { href: "/reports/payments", title: "Payments by Gateway", description: "Revenue breakdown by payment method" },
  { href: "/reports/expenses", title: "Expense Breakdown", description: "Project expenses by category and supplier" },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reports.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle className="text-base">{r.title}</CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create unpaid invoices report**
```tsx
// src/app/(dashboard)/reports/unpaid/page.tsx
import { api } from "@/trpc/server";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default async function UnpaidReportPage() {
  const invoices = await api.reports.unpaidInvoices({});

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Unpaid Invoices</h1>
      <p className="text-muted-foreground">{invoices.length} invoices outstanding</p>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Invoice</th>
              <th className="text-left p-3">Client</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Due</th>
              <th className="text-right p-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="p-3 font-mono">{inv.number}</td>
                <td className="p-3">{inv.client.name}</td>
                <td className="p-3">
                  <Badge variant="outline">{inv.status}</Badge>
                </td>
                <td className="p-3 text-muted-foreground">
                  {inv.dueDate
                    ? formatDistanceToNow(new Date(inv.dueDate), { addSuffix: true })
                    : "—"}
                </td>
                <td className="p-3 text-right font-medium">
                  {inv.currency.symbol}{Number(inv.total).toFixed(2)}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No unpaid invoices
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 3: Install date-fns**
```bash
npm install date-fns
```

**Step 4: Create payments by gateway report**
```tsx
// src/app/(dashboard)/reports/payments/page.tsx
import { api } from "@/trpc/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PaymentsReportPage() {
  const byGateway = await api.reports.paymentsByGateway({});
  const entries = Object.entries(byGateway);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Payments by Gateway</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {entries.map(([method, stats]) => (
          <Card key={method}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{method.replace("_", " ")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transactions</span>
                <span className="font-medium">{stats.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">${stats.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gateway fees</span>
                <span className="font-medium text-destructive">-${stats.fees.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {entries.length === 0 && (
          <p className="col-span-3 text-muted-foreground">No payments recorded</p>
        )}
      </div>
    </div>
  );
}
```

**Step 5: Create expense breakdown report**
```tsx
// src/app/(dashboard)/reports/expenses/page.tsx
import { api } from "@/trpc/server";

export default async function ExpensesReportPage() {
  const expenses = await api.reports.expenseBreakdown({});

  const totalByCategory: Record<string, number> = {};
  for (const e of expenses) {
    const key = e.category?.name ?? "Uncategorized";
    totalByCategory[key] = (totalByCategory[key] ?? 0) + e.qty * Number(e.rate);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Expense Breakdown</h1>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Project</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-right p-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{e.name}</td>
                <td className="p-3 text-muted-foreground">{e.project.name}</td>
                <td className="p-3">{e.category?.name ?? "—"}</td>
                <td className="p-3">{e.supplier?.name ?? "—"}</td>
                <td className="p-3 text-right font-medium">
                  ${(e.qty * Number(e.rate)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 6: Add Reports link to sidebar**

In `src/app/(dashboard)/layout.tsx`, add a sidebar link for `/reports` with a BarChart icon.

**Step 7: Commit**
```bash
git add src/app/\(dashboard\)/reports/ src/app/\(dashboard\)/layout.tsx
git commit -m "feat(reports): reports pages — unpaid, payments by gateway, expense breakdown"
```

---

## Task 8: Estimate Accept/Decline Workflow

**Files:**
- Modify: `src/server/routers/invoices.ts`
- Create: `src/components/portal/EstimateActions.tsx`
- Modify: `src/app/portal/[token]/page.tsx`

**Step 1: Add accept/decline procedures to invoices router**

In `src/server/routers/invoices.ts`, add these procedures to the router:
```typescript
acceptEstimate: protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    const inv = await ctx.db.invoice.findFirst({
      where: { id: input.id, organizationId: org.id, type: "ESTIMATE" },
    });
    if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.invoice.update({
      where: { id: input.id },
      data: { status: "ACCEPTED" },
    });
  }),

declineEstimate: protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    const inv = await ctx.db.invoice.findFirst({
      where: { id: input.id, organizationId: org.id, type: "ESTIMATE" },
    });
    if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.invoice.update({
      where: { id: input.id },
      data: { status: "REJECTED" },
    });
  }),
```

**Step 2: Create portal estimate actions component**
```tsx
// src/components/portal/EstimateActions.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InvoiceStatus } from "@/generated/prisma";

interface Props {
  invoiceId: string;
  token: string;
  currentStatus: InvoiceStatus;
}

export function EstimateActions({ invoiceId, token, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "accept" | "decline") {
    setLoading(true);
    const res = await fetch(`/api/portal/${token}/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setStatus(action === "accept" ? InvoiceStatus.ACCEPTED : InvoiceStatus.REJECTED);
    }
    setLoading(false);
  }

  if (status === InvoiceStatus.ACCEPTED) {
    return <p className="text-green-600 font-medium">Estimate accepted</p>;
  }
  if (status === InvoiceStatus.REJECTED) {
    return <p className="text-red-600 font-medium">Estimate declined</p>;
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => handleAction("accept")} disabled={loading}>
        Accept Estimate
      </Button>
      <Button variant="outline" onClick={() => handleAction("decline")} disabled={loading}>
        Decline
      </Button>
    </div>
  );
}
```

**Step 3: Create the portal estimate API route**
```typescript
// src/app/api/portal/[token]/estimate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { action } = (await req.json()) as { action: "accept" | "decline" };

  const invoice = await db.invoice.findUnique({ where: { portalToken: token } });
  if (!invoice || invoice.type !== "ESTIMATE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const newStatus = action === "accept" ? "ACCEPTED" : "REJECTED";
  await db.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });
  return NextResponse.json({ status: newStatus });
}
```

**Step 4: Render EstimateActions in portal page**

In `src/app/portal/[token]/page.tsx`, conditionally render `<EstimateActions>` when `invoice.type === "ESTIMATE"`.

**Step 5: Commit**
```bash
git add src/server/routers/invoices.ts src/components/portal/EstimateActions.tsx src/app/api/portal/
git commit -m "feat(estimates): accept/decline workflow in portal and dashboard"
```

---

## Task 9: Credit Note Application

**Files:**
- Create: `src/server/routers/creditNotes.ts`
- Modify: `src/server/routers/_app.ts`
- Create: `src/components/invoices/ApplyCreditNoteDialog.tsx`

**Step 1: Write failing test**
```typescript
// src/test/credit-notes.test.ts
import { describe, it, expect } from "vitest";
import { validateCreditApplication } from "@/server/routers/creditNotes";

describe("validateCreditApplication", () => {
  it("rejects if amount > credit note total", () => {
    expect(() => validateCreditApplication(50, 100, 200)).toThrow("exceeds");
  });
  it("rejects if amount > invoice remaining balance", () => {
    expect(() => validateCreditApplication(150, 200, 100)).toThrow("exceeds");
  });
  it("accepts valid amount", () => {
    expect(() => validateCreditApplication(50, 100, 100)).not.toThrow();
  });
});
```

Run: `npm run test:run -- src/test/credit-notes.test.ts`
Expected: FAIL

**Step 2: Create credit notes router**
```typescript
// src/server/routers/creditNotes.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { InvoiceType } from "@/generated/prisma";

export function validateCreditApplication(
  applyAmount: number,
  creditNoteTotal: number,
  invoiceBalance: number,
) {
  if (applyAmount > creditNoteTotal) {
    throw new Error(`Amount exceeds credit note total of ${creditNoteTotal}`);
  }
  if (applyAmount > invoiceBalance) {
    throw new Error(`Amount exceeds invoice balance of ${invoiceBalance}`);
  }
}

export const creditNotesRouter = router({
  listForClient: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.invoice.findMany({
        where: {
          organizationId: org.id,
          clientId: input.clientId,
          type: InvoiceType.CREDIT_NOTE,
          isArchived: false,
        },
        include: {
          creditNotesIssued: true,
          currency: true,
        },
      });
    }),

  applyToInvoice: protectedProcedure
    .input(
      z.object({
        creditNoteId: z.string(),
        invoiceId: z.string(),
        amount: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const [creditNote, invoice] = await Promise.all([
        ctx.db.invoice.findFirst({
          where: { id: input.creditNoteId, organizationId: org.id, type: InvoiceType.CREDIT_NOTE },
          include: { creditNotesIssued: true },
        }),
        ctx.db.invoice.findFirst({
          where: { id: input.invoiceId, organizationId: org.id },
          include: { payments: true, creditNotesReceived: true },
        }),
      ]);

      if (!creditNote || !invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const totalApplied = creditNote.creditNotesIssued.reduce(
        (sum, a) => sum + Number(a.amount),
        0,
      );
      const creditRemaining = Number(creditNote.total) - totalApplied;

      const totalPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const creditApplied = invoice.creditNotesReceived.reduce(
        (sum, a) => sum + Number(a.amount),
        0,
      );
      const invoiceBalance = Number(invoice.total) - totalPaid - creditApplied;

      try {
        validateCreditApplication(input.amount, creditRemaining, invoiceBalance);
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }

      return ctx.db.creditNoteApplication.create({
        data: {
          creditNoteId: input.creditNoteId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          organizationId: org.id,
        },
      });
    }),
});
```

**Step 3: Run tests**
```bash
npm run test:run -- src/test/credit-notes.test.ts
```
Expected: 3 tests pass

**Step 4: Register in _app.ts**
```typescript
import { creditNotesRouter } from "./creditNotes";
// creditNotes: creditNotesRouter,
```

**Step 5: Create apply credit note dialog**
```tsx
// src/components/invoices/ApplyCreditNoteDialog.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  invoiceId: string;
  clientId: string;
}

export function ApplyCreditNoteDialog({ invoiceId, clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedCreditNoteId, setSelectedCreditNoteId] = useState("");
  const [amount, setAmount] = useState("");

  const { data: creditNotes } = trpc.creditNotes.listForClient.useQuery({ clientId });
  const utils = trpc.useUtils();

  const apply = trpc.creditNotes.applyToInvoice.useMutation({
    onSuccess: () => {
      utils.invoices.get.invalidate({ id: invoiceId });
      setOpen(false);
    },
  });

  const availableCreditNotes = (creditNotes ?? []).filter((cn) => {
    const applied = cn.creditNotesIssued.reduce((s, a) => s + Number(a.amount), 0);
    return Number(cn.total) - applied > 0;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Apply Credit Note</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Credit Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Credit Note</Label>
            <Select value={selectedCreditNoteId} onValueChange={setSelectedCreditNoteId}>
              <SelectTrigger><SelectValue placeholder="Select credit note" /></SelectTrigger>
              <SelectContent>
                {availableCreditNotes.map((cn) => {
                  const applied = cn.creditNotesIssued.reduce((s, a) => s + Number(a.amount), 0);
                  const remaining = Number(cn.total) - applied;
                  return (
                    <SelectItem key={cn.id} value={cn.id}>
                      {cn.number} — {cn.currency.symbol}{remaining.toFixed(2)} available
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Amount to Apply</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={!selectedCreditNoteId || !amount || apply.isPending}
            onClick={() =>
              apply.mutate({
                creditNoteId: selectedCreditNoteId,
                invoiceId,
                amount: Number(amount),
              })
            }
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 6: Commit**
```bash
git add src/server/routers/creditNotes.ts src/server/routers/_app.ts src/components/invoices/ApplyCreditNoteDialog.tsx src/test/credit-notes.test.ts
git commit -m "feat(credit-notes): credit note application logic and UI"
```

---

## Task 10: File Attachments — Storage + API Route

**Files:**
- Create: `src/server/services/storage.ts`
- Create: `src/app/api/attachments/route.ts`
- Create: `src/app/api/attachments/[id]/route.ts`
- Modify: `src/lib/env.ts`

**Step 1: Install Vercel Blob**
```bash
npm install @vercel/blob
```

**Step 2: Add env vars**
```typescript
// In env.ts server vars:
BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
// In runtimeEnv:
BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
```

**Step 3: Create storage service**
```typescript
// src/server/services/storage.ts
import { put, del } from "@vercel/blob";

export async function uploadFile(
  filename: string,
  file: Blob,
  pathname: string,
): Promise<{ url: string; storageKey: string }> {
  const blob = await put(`${pathname}/${filename}`, file, { access: "public" });
  return { url: blob.url, storageKey: blob.url };
}

export async function deleteFile(storageUrl: string): Promise<void> {
  await del(storageUrl);
}
```

**Step 4: Create upload API route**
```typescript
// src/app/api/attachments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { uploadFile } from "@/server/services/storage";
import { AttachmentContext } from "@/generated/prisma";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const context = formData.get("context") as AttachmentContext | null;
  const contextId = formData.get("contextId") as string | null;

  if (!file || !context || !contextId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  const org = await db.organization.findFirst({ where: { clerkId: orgId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { url, storageKey } = await uploadFile(
    file.name,
    file,
    `${org.id}/${context.toLowerCase()}/${contextId}`,
  );

  const attachment = await db.attachment.create({
    data: {
      filename: storageKey,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      storageUrl: url,
      context,
      contextId,
      uploadedById: userId,
      organizationId: org.id,
    },
  });

  return NextResponse.json(attachment);
}
```

**Step 5: Create delete route**
```typescript
// src/app/api/attachments/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { deleteFile } from "@/server/services/storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const org = await db.organization.findFirst({ where: { clerkId: orgId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachment = await db.attachment.findFirst({
    where: { id, organizationId: org.id },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteFile(attachment.storageUrl);
  await db.attachment.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
```

**Step 6: Add attachments tRPC query**

Create `src/server/routers/attachments.ts`:
```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { AttachmentContext } from "@/generated/prisma";

export const attachmentsRouter = router({
  list: protectedProcedure
    .input(z.object({ context: z.nativeEnum(AttachmentContext), contextId: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.attachment.findMany({
        where: { organizationId: org.id, context: input.context, contextId: input.contextId },
        orderBy: { createdAt: "desc" },
      });
    }),
});
```

Register in `_app.ts`: `attachments: attachmentsRouter`

**Step 7: Commit**
```bash
git add src/server/services/storage.ts src/app/api/attachments/ src/server/routers/attachments.ts src/server/routers/_app.ts src/lib/env.ts
git commit -m "feat(attachments): file upload storage service and API routes"
```

---

## Task 11: File Attachments — UI Component

**Files:**
- Create: `src/components/attachments/AttachmentPanel.tsx`

**Step 1: Create the attachment panel**
```tsx
// src/components/attachments/AttachmentPanel.tsx
"use client";

import { useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2, ExternalLink } from "lucide-react";
import { AttachmentContext } from "@/generated/prisma";
import { formatBytes } from "@/lib/utils";

interface Props {
  context: AttachmentContext;
  contextId: string;
}

export function AttachmentPanel({ context, contextId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();

  const { data: attachments } = trpc.attachments.list.useQuery({ context, contextId });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("context", context);
    fd.append("contextId", contextId);
    await fetch("/api/attachments", { method: "POST", body: fd });
    utils.attachments.list.invalidate({ context, contextId });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(id: string) {
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    utils.attachments.list.invalidate({ context, contextId });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Attachments</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Paperclip className="h-4 w-4 mr-1" />
          {uploading ? "Uploading..." : "Attach File"}
        </Button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
      </div>
      <div className="space-y-2">
        {(attachments ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-2 p-2 border rounded-md text-sm">
            <span className="flex-1 truncate">{a.originalName}</span>
            <span className="text-muted-foreground">{formatBytes(a.size)}</span>
            <a href={a.storageUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </a>
            <button onClick={() => handleDelete(a.id)}>
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Add `formatBytes` to utils.ts**
```typescript
// In src/lib/utils.ts, add:
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

**Step 3: Add AttachmentPanel to invoice detail and project detail pages**

In `src/app/(dashboard)/invoices/[id]/page.tsx` and `src/app/(dashboard)/projects/[id]/page.tsx`, add:
```tsx
import { AttachmentPanel } from "@/components/attachments/AttachmentPanel";
// In page JSX:
<AttachmentPanel context="INVOICE" contextId={invoice.id} />
// or
<AttachmentPanel context="PROJECT" contextId={project.id} />
```

**Step 4: Commit**
```bash
git add src/components/attachments/ src/lib/utils.ts src/app/\(dashboard\)/
git commit -m "feat(attachments): AttachmentPanel component for invoices and projects"
```

---

## Task 12: Notifications — Service + tRPC

**Files:**
- Create: `src/server/services/notifications.ts`
- Create: `src/server/routers/notifications.ts`
- Modify: `src/server/routers/_app.ts`

**Step 1: Create notification service**
```typescript
// src/server/services/notifications.ts
import { db } from "../db";
import { NotificationType } from "@/generated/prisma";

interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  userId: string;
  organizationId: string;
}

export async function createNotification(input: CreateNotificationInput) {
  return db.notification.create({ data: input });
}

export async function notifyOrgAdmins(
  orgId: string,
  notification: Omit<CreateNotificationInput, "userId" | "organizationId">,
) {
  const org = await db.organization.findFirst({
    where: { id: orgId },
    include: { users: { where: { role: "ADMIN" } } },
  });
  if (!org) return;

  await Promise.all(
    org.users.map((u) =>
      createNotification({ ...notification, userId: u.clerkId, organizationId: org.id }),
    ),
  );
}
```

**Step 2: Create notifications router**
```typescript
// src/server/routers/notifications.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.notification.findMany({
        where: { organizationId: org.id, userId: ctx.userId! },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.notification.count({
      where: { organizationId: org.id, userId: ctx.userId!, isRead: false },
    });
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.notification.updateMany({
        where: { id: input.id, organizationId: org.id, userId: ctx.userId! },
        data: { isRead: true },
      });
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.notification.updateMany({
      where: { organizationId: org.id, userId: ctx.userId!, isRead: false },
      data: { isRead: true },
    });
  }),
});
```

**Step 3: Register in _app.ts**
```typescript
import { notificationsRouter } from "./notifications";
notifications: notificationsRouter,
```

**Step 4: Add notification calls to invoice mutations**

In `src/server/routers/invoices.ts`, import `notifyOrgAdmins` and add calls in key places:
- After `send` mutation: `await notifyOrgAdmins(org.id, { type: "INVOICE_SENT", title: "Invoice sent", body: `Invoice ${invoice.number} sent to client`, link: `/invoices/${invoice.id}` });`

**Step 5: Commit**
```bash
git add src/server/services/notifications.ts src/server/routers/notifications.ts src/server/routers/_app.ts
git commit -m "feat(notifications): notification service and tRPC router"
```

---

## Task 13: Notifications — Bell UI

**Files:**
- Create: `src/components/notifications/NotificationBell.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Create notification bell component**
```tsx
// src/components/notifications/NotificationBell.tsx
"use client";

import { trpc } from "@/trpc/client";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const { data: count } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: notifications } = trpc.notifications.list.useQuery({ limit: 10 });
  const utils = trpc.useUtils();
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {(count ?? 0) > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <span className="font-medium text-sm">Notifications</span>
          {(count ?? 0) > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {(notifications ?? []).map((n) => (
            <div
              key={n.id}
              className={`p-3 border-b text-sm ${!n.isRead ? "bg-muted/30" : ""}`}
            >
              <p className="font-medium">{n.title}</p>
              <p className="text-muted-foreground">{n.body}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </p>
            </div>
          ))}
          {(notifications ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">No notifications</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Step 2: Add Popover shadcn component**
```bash
npx shadcn@latest add popover
```

**Step 3: Add NotificationBell to dashboard layout header**

In `src/app/(dashboard)/layout.tsx`, import and add `<NotificationBell />` to the header area.

**Step 4: Commit**
```bash
git add src/components/notifications/ src/app/\(dashboard\)/layout.tsx
git commit -m "feat(notifications): notification bell UI with unread count"
```

---

## Task 14: Audit Log

**Files:**
- Create: `src/server/services/audit.ts`
- Create: `src/server/routers/auditLog.ts`
- Modify: `src/server/routers/_app.ts`
- Create: `src/app/(dashboard)/settings/audit-log/page.tsx`

**Step 1: Create audit service**
```typescript
// src/server/services/audit.ts
import { db } from "../db";
import { AuditAction } from "@/generated/prisma";

interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  diff?: Record<string, unknown>;
  userId?: string;
  userLabel?: string;
  organizationId: string;
}

export async function logAudit(input: AuditInput) {
  return db.auditLog.create({ data: input });
}
```

**Step 2: Create audit log router**
```typescript
// src/server/routers/auditLog.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const auditLogRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.number().int().max(100).default(50),
        offset: z.number().int().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.auditLog.findMany({
        where: {
          organizationId: org.id,
          ...(input.entityType ? { entityType: input.entityType } : {}),
          ...(input.entityId ? { entityId: input.entityId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      });
    }),
});
```

**Step 3: Register in _app.ts**
```typescript
import { auditLogRouter } from "./auditLog";
auditLog: auditLogRouter,
```

**Step 4: Add audit calls to key invoice mutations**

In `src/server/routers/invoices.ts`:
```typescript
import { logAudit } from "../services/audit";
// After create mutation:
await logAudit({ action: "CREATED", entityType: "Invoice", entityId: invoice.id, entityLabel: invoice.number, organizationId: org.id, userId: ctx.userId });
// After status change:
await logAudit({ action: "STATUS_CHANGED", entityType: "Invoice", entityId: invoice.id, diff: { status: newStatus }, organizationId: org.id, userId: ctx.userId });
```

**Step 5: Create audit log settings page**
```tsx
// src/app/(dashboard)/settings/audit-log/page.tsx
import { api } from "@/trpc/server";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

const actionColors: Record<string, string> = {
  CREATED: "bg-green-100 text-green-800",
  UPDATED: "bg-blue-100 text-blue-800",
  DELETED: "bg-red-100 text-red-800",
  STATUS_CHANGED: "bg-purple-100 text-purple-800",
  PAYMENT_RECEIVED: "bg-emerald-100 text-emerald-800",
  SENT: "bg-sky-100 text-sky-800",
  VIEWED: "bg-gray-100 text-gray-800",
};

export default async function AuditLogPage() {
  const logs = await api.auditLog.list({ limit: 50 });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Activity Log</h1>
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="flex items-center gap-3 p-3 border rounded-md text-sm">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[log.action] ?? ""}`}>
              {log.action}
            </span>
            <span className="text-muted-foreground">{log.entityType}</span>
            <span className="font-medium">{log.entityLabel ?? log.entityId}</span>
            {log.userLabel && <span className="text-muted-foreground">by {log.userLabel}</span>}
            <span className="ml-auto text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 6: Commit**
```bash
git add src/server/services/audit.ts src/server/routers/auditLog.ts src/server/routers/_app.ts src/app/\(dashboard\)/settings/audit-log/
git commit -m "feat(audit): audit log service, router, and activity log page"
```

---

## Task 15: Support Tickets

**Files:**
- Create: `src/server/routers/tickets.ts`
- Modify: `src/server/routers/_app.ts`
- Create: `src/app/(dashboard)/tickets/page.tsx`
- Create: `src/app/(dashboard)/tickets/new/page.tsx`
- Create: `src/app/(dashboard)/tickets/[id]/page.tsx`
- Create: `src/components/tickets/TicketForm.tsx`

**Step 1: Create tickets router**
```typescript
// src/server/routers/tickets.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { TicketStatus, TicketPriority } from "@/generated/prisma";

export const ticketsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(TicketStatus).optional(),
        clientId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.ticket.findMany({
        where: {
          organizationId: org.id,
          ...(input.status ? { status: input.status } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
        },
        include: { client: true, messages: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const ticket = await ctx.db.ticket.findFirst({
        where: { id: input.id, organizationId: org.id },
        include: { client: true, messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
      return ticket;
    }),

  create: protectedProcedure
    .input(
      z.object({
        subject: z.string().min(1),
        body: z.string().min(1),
        priority: z.nativeEnum(TicketPriority).default(TicketPriority.NORMAL),
        clientId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const lastTicket = await ctx.db.ticket.findFirst({
        where: { organizationId: org.id },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const number = (lastTicket?.number ?? 0) + 1;

      return ctx.db.ticket.create({
        data: {
          number,
          subject: input.subject,
          priority: input.priority,
          clientId: input.clientId,
          organizationId: org.id,
          messages: {
            create: {
              body: input.body,
              isStaff: true,
              authorId: ctx.userId,
            },
          },
        },
        include: { messages: true },
      });
    }),

  reply: protectedProcedure
    .input(z.object({ ticketId: z.string(), body: z.string().min(1), isStaff: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.ticketMessage.create({
        data: {
          ticketId: input.ticketId,
          body: input.body,
          isStaff: input.isStaff,
          authorId: ctx.userId,
        },
      });
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.nativeEnum(TicketStatus) }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.ticket.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),
});
```

**Step 2: Register in _app.ts**
```typescript
import { ticketsRouter } from "./tickets";
tickets: ticketsRouter,
```

**Step 3: Create tickets list page**
```tsx
// src/app/(dashboard)/tickets/page.tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

const priorityColors = {
  LOW: "secondary",
  NORMAL: "outline",
  HIGH: "default",
  URGENT: "destructive",
} as const;

export default async function TicketsPage() {
  const tickets = await api.tickets.list({});

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Support Tickets</h1>
        <Button asChild>
          <Link href="/tickets/new">New Ticket</Link>
        </Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">#</th>
              <th className="text-left p-3">Subject</th>
              <th className="text-left p-3">Client</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Priority</th>
              <th className="text-left p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-mono text-muted-foreground">#{t.number}</td>
                <td className="p-3">
                  <Link href={`/tickets/${t.id}`} className="hover:underline font-medium">
                    {t.subject}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground">{t.client?.name ?? "—"}</td>
                <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                <td className="p-3">
                  <Badge variant={priorityColors[t.priority]}>{t.priority}</Badge>
                </td>
                <td className="p-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 4: Create ticket detail page**
```tsx
// src/app/(dashboard)/tickets/[id]/page.tsx
import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import { TicketThread } from "@/components/tickets/TicketThread";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await api.tickets.get({ id }).catch(() => null);
  if (!ticket) notFound();

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Ticket #{ticket.number}</p>
        <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
      </div>
      <TicketThread ticket={ticket} />
    </div>
  );
}
```

**Step 5: Create TicketThread client component**
```tsx
// src/components/tickets/TicketThread.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import type { Ticket, TicketMessage } from "@/generated/prisma";

interface Props {
  ticket: Ticket & { messages: TicketMessage[] };
}

export function TicketThread({ ticket }: Props) {
  const [body, setBody] = useState("");
  const utils = trpc.useUtils();
  const reply = trpc.tickets.reply.useMutation({
    onSuccess: () => {
      utils.tickets.get.invalidate({ id: ticket.id });
      setBody("");
    },
  });

  return (
    <div className="space-y-4">
      {ticket.messages.map((m) => (
        <div
          key={m.id}
          className={`p-4 rounded-lg border text-sm ${m.isStaff ? "bg-muted/30" : "bg-background"}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium">{m.isStaff ? "Staff" : (m.authorName ?? "Client")}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
      <div className="space-y-2">
        <Textarea
          placeholder="Write a reply..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
        />
        <Button
          onClick={() => reply.mutate({ ticketId: ticket.id, body })}
          disabled={!body.trim() || reply.isPending}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
```

**Step 6: Create new ticket page**
```tsx
// src/app/(dashboard)/tickets/new/page.tsx
import { TicketForm } from "@/components/tickets/TicketForm";

export default function NewTicketPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Ticket</h1>
      <TicketForm />
    </div>
  );
}
```

```tsx
// src/components/tickets/TicketForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketPriority } from "@/generated/prisma";

export function TicketForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TicketPriority>(TicketPriority.NORMAL);

  const create = trpc.tickets.create.useMutation({
    onSuccess: (ticket) => router.push(`/tickets/${ticket.id}`),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ subject, body, priority });
      }}
    >
      <div className="grid gap-2">
        <Label>Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="NORMAL">Normal</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Description</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required />
      </div>
      <Button type="submit" disabled={create.isPending}>Create Ticket</Button>
    </form>
  );
}
```

**Step 7: Add Tickets link to sidebar in layout.tsx**

**Step 8: Commit**
```bash
git add src/server/routers/tickets.ts src/server/routers/_app.ts src/app/\(dashboard\)/tickets/ src/components/tickets/
git commit -m "feat(tickets): support ticket system with threaded replies"
```

---

## Task 16: Discussion Threads

**Files:**
- Create: `src/server/routers/discussions.ts`
- Modify: `src/server/routers/_app.ts`
- Create: `src/components/projects/DiscussionThread.tsx`
- Modify: `src/app/(dashboard)/projects/[id]/page.tsx`

**Step 1: Create discussions router**
```typescript
// src/server/routers/discussions.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const discussionsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.discussion.findMany({
        where: { projectId: input.projectId, organizationId: org.id },
        include: { replies: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: protectedProcedure
    .input(z.object({ projectId: z.string(), subject: z.string().min(1), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.discussion.create({
        data: {
          projectId: input.projectId,
          subject: input.subject,
          body: input.body,
          isStaff: true,
          authorId: ctx.userId,
          organizationId: org.id,
        },
        include: { replies: true },
      });
    }),

  reply: protectedProcedure
    .input(z.object({ discussionId: z.string(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.discussionReply.create({
        data: {
          discussionId: input.discussionId,
          body: input.body,
          isStaff: true,
          authorId: ctx.userId,
        },
      });
    }),
});
```

**Step 2: Register in _app.ts**
```typescript
import { discussionsRouter } from "./discussions";
discussions: discussionsRouter,
```

**Step 3: Create DiscussionThread component**
```tsx
// src/components/projects/DiscussionThread.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  projectId: string;
}

export function DiscussionThread({ projectId }: Props) {
  const { data: discussions } = trpc.discussions.list.useQuery({ projectId });
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState<Record<string, string>>({});
  const utils = trpc.useUtils();

  const create = trpc.discussions.create.useMutation({
    onSuccess: () => {
      utils.discussions.list.invalidate({ projectId });
      setNewSubject("");
      setNewBody("");
    },
  });

  const reply = trpc.discussions.reply.useMutation({
    onSuccess: (_, vars) => {
      utils.discussions.list.invalidate({ projectId });
      setReplyBody((prev) => ({ ...prev, [vars.discussionId]: "" }));
    },
  });

  return (
    <div className="space-y-4">
      {(discussions ?? []).map((d) => (
        <div key={d.id} className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/30"
            onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium flex-1">{d.subject}</span>
            <span className="text-xs text-muted-foreground">
              {d.replies.length} {d.replies.length === 1 ? "reply" : "replies"}
            </span>
            {expandedId === d.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expandedId === d.id && (
            <div className="border-t p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
              </p>
              <p className="text-sm whitespace-pre-wrap">{d.body}</p>

              {d.replies.map((r) => (
                <div key={r.id} className="ml-4 pl-4 border-l text-sm">
                  <p className="text-xs text-muted-foreground mb-1">
                    {r.isStaff ? "Staff" : "Client"} ·{" "}
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                  <p>{r.body}</p>
                </div>
              ))}

              <div className="flex gap-2 mt-2">
                <Textarea
                  className="text-sm"
                  placeholder="Write a reply..."
                  value={replyBody[d.id] ?? ""}
                  onChange={(e) =>
                    setReplyBody((prev) => ({ ...prev, [d.id]: e.target.value }))
                  }
                  rows={2}
                />
                <Button
                  size="sm"
                  disabled={!replyBody[d.id]?.trim() || reply.isPending}
                  onClick={() =>
                    reply.mutate({ discussionId: d.id, body: replyBody[d.id] ?? "" })
                  }
                >
                  Reply
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium">Start a Discussion</h3>
        <Input
          placeholder="Subject"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
        />
        <Textarea
          placeholder="What would you like to discuss?"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          rows={3}
        />
        <Button
          size="sm"
          disabled={!newSubject.trim() || !newBody.trim() || create.isPending}
          onClick={() => create.mutate({ projectId, subject: newSubject, body: newBody })}
        >
          Post
        </Button>
      </div>
    </div>
  );
}
```

**Step 4: Add Discussions tab to project detail page**

In `src/app/(dashboard)/projects/[id]/page.tsx`, add a "Discussions" tab that renders `<DiscussionThread projectId={project.id} />`.

**Step 5: Commit**
```bash
git add src/server/routers/discussions.ts src/server/routers/_app.ts src/components/projects/DiscussionThread.tsx src/app/\(dashboard\)/projects/
git commit -m "feat(discussions): project discussion threads with nested replies"
```

---

## Task 17: Public REST API v1

**Files:**
- Create: `src/app/api/v1/middleware.ts` (shared auth helper)
- Create: `src/app/api/v1/invoices/route.ts`
- Create: `src/app/api/v1/invoices/[id]/route.ts`
- Create: `src/app/api/v1/clients/route.ts`
- Create: `src/app/api/v1/clients/[id]/route.ts`
- Create: `src/app/api/v1/projects/route.ts`
- Create: `src/app/api/v1/projects/[id]/route.ts`

**Step 1: Create shared API auth helper**
```typescript
// src/app/api/v1/auth.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";

export interface V1Context {
  orgId: string;
  userId: string;
}

export async function withV1Auth(
  req: NextRequest,
  handler: (ctx: V1Context) => Promise<NextResponse>,
): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // API keys are stored as org settings; for now, use Clerk session token
  // Future: implement proper API key table
  const token = authHeader.slice(7);

  // Validate token via Clerk's verify endpoint
  const verifyRes = await fetch("https://api.clerk.com/v1/sessions/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!verifyRes.ok) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const session = (await verifyRes.json()) as { user_id: string; organization_id?: string };
  if (!session.organization_id) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 });
  }

  return handler({ orgId: session.organization_id, userId: session.user_id });
}

export function paginationParams(req: NextRequest) {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const perPage = Math.min(Number(url.searchParams.get("per_page") ?? "20"), 100);
  return { skip: (page - 1) * perPage, take: perPage };
}
```

**Step 2: Invoices endpoint**
```typescript
// src/app/api/v1/invoices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth, paginationParams } from "../auth";

export async function GET(req: NextRequest) {
  return withV1Auth(req, async ({ orgId }) => {
    const org = await db.organization.findFirst({ where: { clerkId: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { skip, take } = paginationParams(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const invoices = await db.invoice.findMany({
      where: {
        organizationId: org.id,
        ...(status ? { status: status as never } : {}),
        isArchived: false,
      },
      include: { client: { select: { id: true, name: true, email: true } }, currency: true },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: invoices, page: Math.floor(skip / take) + 1 });
  });
}
```

**Step 3: Invoice by ID endpoint**
```typescript
// src/app/api/v1/invoices/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth } from "../../auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withV1Auth(req, async ({ orgId }) => {
    const { id } = await params;
    const org = await db.organization.findFirst({ where: { clerkId: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const invoice = await db.invoice.findFirst({
      where: { id, organizationId: org.id },
      include: {
        client: true,
        currency: true,
        lines: { include: { taxes: { include: { tax: true } } } },
        payments: true,
        partialPayments: true,
      },
    });

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: invoice });
  });
}
```

**Step 4: Clients endpoint**
```typescript
// src/app/api/v1/clients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth, paginationParams } from "../auth";

export async function GET(req: NextRequest) {
  return withV1Auth(req, async ({ orgId }) => {
    const org = await db.organization.findFirst({ where: { clerkId: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { skip, take } = paginationParams(req);
    const clients = await db.client.findMany({
      where: { organizationId: org.id, isArchived: false },
      skip,
      take,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: clients });
  });
}
```

**Step 5: Projects endpoint**
```typescript
// src/app/api/v1/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth, paginationParams } from "../auth";

export async function GET(req: NextRequest) {
  return withV1Auth(req, async ({ orgId }) => {
    const org = await db.organization.findFirst({ where: { clerkId: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { skip, take } = paginationParams(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const projects = await db.project.findMany({
      where: {
        organizationId: org.id,
        ...(status ? { status: status as never } : {}),
      },
      include: { client: { select: { id: true, name: true } } },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: projects });
  });
}
```

**Step 6: Commit**
```bash
git add src/app/api/v1/
git commit -m "feat(api-v1): public REST API v1 — invoices, clients, projects endpoints"
```

---

## Task 18: Navigation & Sidebar Updates

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Add all new routes to the sidebar**

In the dashboard sidebar, add links for:
- `/reports` — BarChart2 icon — "Reports"
- `/tickets` — LifeBuoy icon — "Tickets"
- Under Settings: `/settings/audit-log` — ClipboardList icon — "Activity Log"

The exact sidebar component structure depends on the existing layout. Locate `SidebarMenu` or nav list and add items following the same pattern as existing entries (invoices, projects, timesheets).

**Step 2: Verify the app builds**
```bash
cd /Users/mlaplante/Sites/pancake/v2
npm run build
```
Expected: Build succeeds with no errors

**Step 3: Run all tests**
```bash
npm run test:run
```
Expected: All tests pass

**Step 4: Final commit**
```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "feat(nav): add Reports, Tickets, Activity Log to sidebar navigation"
```

---

## Task 19: Phase 5 Wrap-up

**Step 1: Verify all routes render**

Start the dev server and manually verify:
- `/reports` — reports index
- `/reports/unpaid` — unpaid invoices table
- `/reports/payments` — payments by gateway
- `/reports/expenses` — expense breakdown
- `/tickets` — ticket list
- `/tickets/new` — create ticket form
- `/settings/audit-log` — audit log table
- Invoice detail page — recurring dialog, apply credit note, attachments panel
- Project detail page — discussions tab

**Step 2: Run Inngest Dev Server (optional local testing)**
```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

**Step 3: Update memory file**

After completing Phase 5, update `/Users/mlaplante/.claude/projects/-Users-mlaplante-Sites-pancake/memory/MEMORY.md` to mark Phase 5 as complete and add Phase 5 notes to `patterns.md`.

**Step 4: Tag the release**
```bash
git tag v2-phase-5
```

---

## Environment Variables Summary

New `.env` additions for Phase 5:
```bash
# Inngest (get from app.inngest.com or run local devserver)
INNGEST_SIGNING_KEY=
INNGEST_EVENT_KEY=

# Vercel Blob (get from Vercel dashboard → Storage → Blob)
BLOB_READ_WRITE_TOKEN=
```

---

## Dependency Summary

New packages added in Phase 5:
```bash
npm install inngest date-fns @vercel/blob
npm install --save-dev vitest @vitest/coverage-v8
```

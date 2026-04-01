# Group E: Operational Efficiency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bulk invoice/expense operations, auto-reminder escalation sequences, and scheduled report delivery to reduce manual repetitive work.

**Architecture:** The app is a Next.js 16 monolith using tRPC v11 for server procedures, Prisma 7 with PostgreSQL for data, and Inngest for background cron jobs. Bulk operations extend the existing `InvoiceTableWithBulk` component and add a new `ExpenseTableWithBulk` component. Reminder sequences introduce 3 new Prisma models and a new Inngest daily cron. Scheduled reports introduce 1 new model, a new Inngest cron, and PDF generation via the existing `/api/invoices/[id]/pdf` pattern.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, tRPC v11, Prisma 7, Inngest 3.x, Supabase Auth, Resend (email), Vitest

---

## Task Order: E1 -> E3 -> E2

E1 (Bulk Operations) has no new models and extends existing UI/mutations. E3 (Scheduled Reports) adds 1 new model and a simpler cron. E2 (Auto-Reminder Escalation) is most complex with 3 new models, a settings page, and per-invoice overrides.

---

# E1: Bulk Operations

The invoice list already has `InvoiceTableWithBulk` (`src/components/invoices/InvoiceTableWithBulk.tsx`) with checkbox selection, select-all, and bulk archive/delete. We need to add: (1) bulk Send and bulk Mark Paid actions, (2) progress reporting with partial failure summaries, (3) mobile card layout bulk support, and (4) extend to expenses list with bulk delete and bulk categorize.

## E1-Step 1: Add sendMany and markPaidMany mutations to invoices router

### Files
- **Modify:** `src/server/routers/invoices.ts`

### Test (write first)
- **Create:** `src/test/invoices-bulk-mutations.test.ts`

```typescript
// src/test/invoices-bulk-mutations.test.ts
import { describe, it, expect, vi } from "vitest";

// Pure helpers extracted from the bulk mutation logic
// These validate which invoices are eligible for each bulk action

type InvoiceStub = {
  id: string;
  status: string;
  type: string;
  clientEmail: string | null;
};

export function filterSendableInvoices(invoices: InvoiceStub[]): InvoiceStub[] {
  return invoices.filter(
    (inv) =>
      inv.status === "DRAFT" &&
      inv.type !== "CREDIT_NOTE" &&
      inv.clientEmail !== null
  );
}

export function filterMarkPaidInvoices(invoices: InvoiceStub[]): InvoiceStub[] {
  return invoices.filter((inv) =>
    ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status)
  );
}

describe("filterSendableInvoices", () => {
  it("includes DRAFT invoices with client email", () => {
    const invoices: InvoiceStub[] = [
      { id: "1", status: "DRAFT", type: "DETAILED", clientEmail: "a@b.com" },
      { id: "2", status: "SENT", type: "DETAILED", clientEmail: "c@d.com" },
      { id: "3", status: "DRAFT", type: "CREDIT_NOTE", clientEmail: "e@f.com" },
      { id: "4", status: "DRAFT", type: "DETAILED", clientEmail: null },
    ];
    const result = filterSendableInvoices(invoices);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns empty for no eligible invoices", () => {
    const invoices: InvoiceStub[] = [
      { id: "1", status: "PAID", type: "DETAILED", clientEmail: "a@b.com" },
    ];
    expect(filterSendableInvoices(invoices)).toHaveLength(0);
  });
});

describe("filterMarkPaidInvoices", () => {
  it("includes SENT, PARTIALLY_PAID, and OVERDUE invoices", () => {
    const invoices: InvoiceStub[] = [
      { id: "1", status: "SENT", type: "DETAILED", clientEmail: "a@b.com" },
      { id: "2", status: "PARTIALLY_PAID", type: "DETAILED", clientEmail: null },
      { id: "3", status: "OVERDUE", type: "SIMPLE", clientEmail: "c@d.com" },
      { id: "4", status: "DRAFT", type: "DETAILED", clientEmail: "e@f.com" },
      { id: "5", status: "PAID", type: "DETAILED", clientEmail: "g@h.com" },
    ];
    const result = filterMarkPaidInvoices(invoices);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});
```

### Implementation

Add `sendMany` and `markPaidMany` procedures to the invoices router. Each processes invoices in `Promise.allSettled` to handle partial failures and returns a structured result.

```typescript
// Add to src/server/routers/invoices.ts — after the existing deleteMany procedure (line ~615)

  sendMany: requireRole("OWNER", "ADMIN")
    .input(z.object({ ids: z.array(z.string()).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const invoices = await ctx.db.invoice.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
          status: InvoiceStatus.DRAFT,
          type: { notIn: [InvoiceType.CREDIT_NOTE] },
        },
        include: { client: true, organization: true, currency: true },
      });

      if (invoices.length === 0) {
        return { sent: 0, failed: 0, skipped: input.ids.length, errors: [] as string[] };
      }

      const hdrs = await headers();
      const host = hdrs.get("host") ?? "localhost:3000";
      const proto =
        hdrs.get("x-forwarded-proto") ??
        (host.startsWith("localhost") ? "http" : "https");
      const appUrl = `${proto}://${host}`;

      const errors: string[] = [];
      const results = await Promise.allSettled(
        invoices.map(async (invoice) => {
          // Update status
          await ctx.db.invoice.update({
            where: { id: invoice.id, organizationId: ctx.orgId },
            data: {
              status: invoice.type === InvoiceType.ESTIMATE ? invoice.status : InvoiceStatus.SENT,
              lastSent: new Date(),
            },
          });

          // Send email if client has email
          if (invoice.client.email) {
            try {
              const { render } = await import("@react-email/render");
              const { InvoiceSentEmail } = await import("@/emails/InvoiceSentEmail");
              const resend = new Resend(env.RESEND_API_KEY);
              const html = await render(
                InvoiceSentEmail({
                  invoiceNumber: invoice.number,
                  clientName: invoice.client.name,
                  total: Number(invoice.total).toFixed(2),
                  currencySymbol: invoice.currency.symbol,
                  dueDate: invoice.dueDate?.toLocaleDateString() ?? null,
                  orgName: invoice.organization.name,
                  portalLink: `${appUrl}/portal/${invoice.portalToken}`,
                  logoUrl: invoice.organization.logoUrl ?? undefined,
                })
              );

              const bcc = await getOwnerBcc(invoice.organizationId);
              await resend.emails.send({
                from: env.RESEND_FROM_EMAIL,
                to: invoice.client.email,
                subject: `Invoice #${invoice.number} from ${invoice.organization.name}`,
                html,
                ...(bcc ? { bcc } : {}),
              });
            } catch (err) {
              console.error(`[invoices.sendMany] Failed to email invoice ${invoice.number}:`, err);
            }
          }

          // Audit + notification (non-blocking)
          await Promise.all([
            logAudit({
              action: "SENT",
              entityType: "Invoice",
              entityId: invoice.id,
              entityLabel: invoice.number,
              organizationId: invoice.organization.id,
              userId: ctx.userId,
            }).catch(() => {}),
            notifyOrgAdmins(invoice.organization.id, {
              type: "INVOICE_SENT",
              title: "Invoice sent",
              body: `Invoice #${invoice.number} sent to ${invoice.client.name}`,
              link: `/invoices/${invoice.id}`,
            }).catch(() => {}),
          ]);
        })
      );

      const sent = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      results.forEach((r) => {
        if (r.status === "rejected") {
          errors.push(r.reason?.message ?? "Unknown error");
        }
      });

      return {
        sent,
        failed,
        skipped: input.ids.length - invoices.length,
        errors,
      };
    }),

  markPaidMany: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(50),
        method: z.string().default("manual"),
        paidAt: z.coerce.date().default(() => new Date()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch eligible invoices with their totals
      const invoices = await ctx.db.invoice.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        },
        select: { id: true, total: true, number: true },
      });

      if (invoices.length === 0) {
        return { paid: 0, failed: 0, skipped: input.ids.length, errors: [] as string[] };
      }

      const errors: string[] = [];
      const results = await Promise.allSettled(
        invoices.map(async (invoice) => {
          await ctx.db.$transaction(async (tx) => {
            await tx.payment.create({
              data: {
                amount: invoice.total,
                method: input.method,
                paidAt: input.paidAt,
                invoiceId: invoice.id,
                organizationId: ctx.orgId,
              },
            });
            await tx.invoice.update({
              where: { id: invoice.id, organizationId: ctx.orgId },
              data: { status: InvoiceStatus.PAID },
            });
          });
        })
      );

      const paid = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      results.forEach((r) => {
        if (r.status === "rejected") {
          errors.push(r.reason?.message ?? "Unknown error");
        }
      });

      return { paid, failed, skipped: input.ids.length - invoices.length, errors };
    }),
```

## E1-Step 2: Enhance InvoiceTableWithBulk with Send and Mark Paid actions

### Files
- **Modify:** `src/components/invoices/InvoiceTableWithBulk.tsx`

### Test (write first)
- **Create:** `src/test/bulk-action-bar.test.ts`

```typescript
// src/test/bulk-action-bar.test.ts
import { describe, it, expect } from "vitest";

type BulkResult = { succeeded: number; failed: number; skipped: number; errors: string[] };

export function formatBulkResultMessage(
  action: string,
  result: BulkResult
): { message: string; isError: boolean } {
  const total = result.succeeded + result.failed + result.skipped;
  if (result.failed === 0 && result.skipped === 0) {
    return {
      message: `${result.succeeded} invoice${result.succeeded !== 1 ? "s" : ""} ${action}`,
      isError: false,
    };
  }
  const parts: string[] = [];
  if (result.succeeded > 0) parts.push(`${result.succeeded} ${action}`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  return {
    message: parts.join(", "),
    isError: result.failed > 0,
  };
}

describe("formatBulkResultMessage", () => {
  it("formats all-success message", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 5, failed: 0, skipped: 0, errors: [] });
    expect(result.message).toBe("5 invoices sent");
    expect(result.isError).toBe(false);
  });

  it("formats singular message", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 1, failed: 0, skipped: 0, errors: [] });
    expect(result.message).toBe("1 invoice sent");
    expect(result.isError).toBe(false);
  });

  it("formats partial failure message", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 5, failed: 2, skipped: 0, errors: ["err"] });
    expect(result.message).toBe("5 sent, 2 failed");
    expect(result.isError).toBe(true);
  });

  it("formats skipped-only message", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 0, failed: 0, skipped: 3, errors: [] });
    expect(result.message).toBe("3 skipped");
    expect(result.isError).toBe(false);
  });

  it("formats mixed result", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 3, failed: 1, skipped: 2, errors: ["err"] });
    expect(result.message).toBe("3 sent, 1 failed, 2 skipped");
    expect(result.isError).toBe(true);
  });
});
```

### Implementation

Replace the current bulk action bar in `InvoiceTableWithBulk` with an enhanced version that includes Send and Mark Paid buttons, plus result summaries.

```tsx
// src/components/invoices/InvoiceTableWithBulk.tsx — full replacement
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InvoiceRowActions } from "@/components/invoices/InvoiceRowActions";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { FileText, Archive, Trash2, RefreshCw, Send, CheckCircle } from "lucide-react";

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string; dot: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",       dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",      dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",        dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600",  dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",          dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",      dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",       dot: "bg-gray-300" },
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  DETAILED: "Invoice",
  SIMPLE:   "Invoice",
  ESTIMATE: "Estimate",
  CREDIT_NOTE: "Credit Note",
};

type Invoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  type: InvoiceType;
  date: string | null;
  total: number;
  currency: { symbol: string; symbolPosition: string };
  client: { name: string };
  recurringInvoice?: { isActive: boolean; frequency: string } | null;
};

type Props = {
  invoices: Invoice[];
};

function fmt(n: number, symbol: string, pos: string): string {
  return pos === "before" ? `${symbol}${n.toFixed(2)}` : `${n.toFixed(2)}${symbol}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatBulkResult(
  action: string,
  result: { succeeded: number; failed: number; skipped: number; errors: string[] }
): { message: string; isError: boolean } {
  if (result.failed === 0 && result.skipped === 0) {
    return {
      message: `${result.succeeded} invoice${result.succeeded !== 1 ? "s" : ""} ${action}`,
      isError: false,
    };
  }
  const parts: string[] = [];
  if (result.succeeded > 0) parts.push(`${result.succeeded} ${action}`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  return { message: parts.join(", "), isError: result.failed > 0 };
}

export function InvoiceTableWithBulk({ invoices }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();
  const utils = trpc.useUtils();

  function onBulkComplete() {
    setSelected(new Set());
    router.refresh();
    void utils.invoices.list.invalidate();
  }

  const archiveMany = trpc.invoices.archiveMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} invoice${result.count !== 1 ? "s" : ""} archived`);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMany = trpc.invoices.deleteMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} invoice${result.count !== 1 ? "s" : ""} deleted`);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendMany = trpc.invoices.sendMany.useMutation({
    onSuccess: (result) => {
      const { message, isError } = formatBulkResult("sent", {
        succeeded: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
      });
      if (isError) {
        toast.error(message);
      } else {
        toast.success(message);
      }
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const markPaidMany = trpc.invoices.markPaidMany.useMutation({
    onSuccess: (result) => {
      const { message, isError } = formatBulkResult("marked paid", {
        succeeded: result.paid,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
      });
      if (isError) {
        toast.error(message);
      } else {
        toast.success(message);
      }
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const allIds = invoices.map((i) => i.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;
  const isLoading = archiveMany.isPending || deleteMany.isPending || sendMany.isPending || markPaidMany.isPending;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedIds = Array.from(selected);

  // Determine which bulk actions make sense for the selection
  const selectedInvoices = invoices.filter((i) => selected.has(i.id));
  const hasSendable = selectedInvoices.some((i) => i.status === "DRAFT");
  const hasPayable = selectedInvoices.some(
    (i) => i.status === "SENT" || i.status === "PARTIALLY_PAID" || i.status === "OVERDUE"
  );

  return (
    <div className="space-y-3">
      {/* Floating bulk action bar */}
      {someSelected && (
        <div className="sticky top-2 z-20 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-lg print:hidden">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-1.5 ml-auto">
            {hasSendable && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                disabled={isLoading}
                onClick={() => sendMany.mutate({ ids: selectedIds })}
              >
                <Send className="w-3.5 h-3.5" />
                Send ({selectedInvoices.filter((i) => i.status === "DRAFT").length})
              </Button>
            )}
            {hasPayable && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                disabled={isLoading}
                onClick={() => markPaidMany.mutate({ ids: selectedIds })}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Mark Paid ({selectedInvoices.filter((i) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)).length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              disabled={isLoading}
              onClick={() => archiveMany.mutate({ ids: selectedIds, isArchived: true })}
            >
              <Archive className="w-3.5 h-3.5" />
              Archive ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs gap-1.5"
              disabled={isLoading}
              onClick={() => deleteMany.mutate({ ids: selectedIds })}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-3 pl-2 w-8 print:hidden">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-border"
                aria-label="Select all"
              />
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Invoice
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Date
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Client
            </th>
            <th className="pb-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Amount
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide pl-4">
              Status
            </th>
            <th className="pb-3 print:hidden" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {invoices.map((inv) => {
            const badge = STATUS_BADGE[inv.status];
            const isSelected = selected.has(inv.id);
            return (
              <tr
                key={inv.id}
                className={cn(
                  "group hover:bg-accent/30 transition-colors",
                  isSelected && "bg-accent/20"
                )}
              >
                <td className="py-3.5 pl-2 print:hidden">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(inv.id)}
                    className="rounded border-border"
                    aria-label={`Select invoice ${inv.number}`}
                  />
                </td>
                <td className="py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground leading-tight flex items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground">#{inv.number}</span>
                        {TYPE_LABELS[inv.type]}
                        {inv.recurringInvoice?.isActive && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary/10 text-primary rounded-md px-1.5 py-0.5"
                            title={`Recurring \u00b7 ${inv.recurringInvoice.frequency.charAt(0) + inv.recurringInvoice.frequency.slice(1).toLowerCase()}`}
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            {inv.recurringInvoice.frequency.charAt(0) + inv.recurringInvoice.frequency.slice(1).toLowerCase()}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {inv.client.name}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 text-muted-foreground">
                  {formatDate(inv.date)}
                </td>
                <td className="py-3.5 text-foreground/80">
                  {inv.client.name}
                </td>
                <td className="py-3.5 text-right font-mono font-semibold tabular-nums text-foreground">
                  {fmt(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                </td>
                <td className="py-3.5 pl-4">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium", badge.className)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.dot)} />
                    {badge.label}
                  </span>
                </td>
                <td className="py-3.5 pr-2 print:hidden">
                  <InvoiceRowActions
                    invoiceId={inv.id}
                    invoiceTotal={inv.total}
                    status={inv.status}
                    invoiceType={inv.type}
                  />
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

## E1-Step 3: Add mobile bulk selection to invoice list page

### Files
- **Modify:** `src/app/(dashboard)/invoices/page.tsx`

### Implementation

Add a client component wrapper for the mobile card list that supports checkbox selection and shows the same floating action bar. Extract the mobile card list into a new client component.

```tsx
// Create: src/components/invoices/InvoiceMobileListWithBulk.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { FileText, Archive, Trash2, RefreshCw, Send, CheckCircle } from "lucide-react";

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string; dot: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",       dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",      dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",        dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600",  dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",          dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",      dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",       dot: "bg-gray-300" },
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  DETAILED: "Invoice",
  SIMPLE:   "Invoice",
  ESTIMATE: "Estimate",
  CREDIT_NOTE: "Credit Note",
};

type Invoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  type: InvoiceType;
  date: string | null;
  total: number;
  currency: { symbol: string; symbolPosition: string };
  client: { name: string };
  recurringInvoice?: { isActive: boolean; frequency: string } | null;
};

function fmt(n: number, symbol: string, pos: string): string {
  return pos === "before" ? `${symbol}${n.toFixed(2)}` : `${n.toFixed(2)}${symbol}`;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function InvoiceMobileListWithBulk({ invoices }: { invoices: Invoice[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const router = useRouter();
  const utils = trpc.useUtils();

  function onBulkComplete() {
    setSelected(new Set());
    setSelectMode(false);
    router.refresh();
    void utils.invoices.list.invalidate();
  }

  const archiveMany = trpc.invoices.archiveMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} archived`);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMany = trpc.invoices.deleteMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} deleted`);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendMany = trpc.invoices.sendMany.useMutation({
    onSuccess: (result) => {
      const msg = result.failed > 0
        ? `${result.sent} sent, ${result.failed} failed`
        : `${result.sent} sent`;
      result.failed > 0 ? toast.error(msg) : toast.success(msg);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const markPaidMany = trpc.invoices.markPaidMany.useMutation({
    onSuccess: (result) => {
      const msg = result.failed > 0
        ? `${result.paid} marked paid, ${result.failed} failed`
        : `${result.paid} marked paid`;
      result.failed > 0 ? toast.error(msg) : toast.success(msg);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading = archiveMany.isPending || deleteMany.isPending || sendMany.isPending || markPaidMany.isPending;
  const someSelected = selected.size > 0;
  const selectedIds = Array.from(selected);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    if (next.size === 0) setSelectMode(false);
  }

  function handleLongPress(id: string) {
    if (!selectMode) {
      setSelectMode(true);
      setSelected(new Set([id]));
    }
  }

  return (
    <div className="sm:hidden print:hidden">
      {/* Toggle select mode */}
      {!selectMode && invoices.length > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground mb-2 underline"
          onClick={() => setSelectMode(true)}
        >
          Select
        </button>
      )}

      {/* Floating action bar */}
      {someSelected && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-lg mb-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isLoading}
              onClick={() => sendMany.mutate({ ids: selectedIds })}>
              <Send className="w-3 h-3" /> Send
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isLoading}
              onClick={() => markPaidMany.mutate({ ids: selectedIds })}>
              <CheckCircle className="w-3 h-3" /> Paid
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isLoading}
              onClick={() => archiveMany.mutate({ ids: selectedIds, isArchived: true })}>
              <Archive className="w-3 h-3" /> Archive
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" disabled={isLoading}
              onClick={() => deleteMany.mutate({ ids: selectedIds })}>
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => { setSelected(new Set()); setSelectMode(false); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Card list */}
      <div className="divide-y divide-border/50">
        {invoices.map((inv) => {
          const badge = STATUS_BADGE[inv.status];
          const isSelected = selected.has(inv.id);

          return (
            <div
              key={inv.id}
              className={cn(
                "flex items-center gap-3 py-3.5 px-2 transition-colors",
                isSelected && "bg-accent/20",
                !selectMode && "hover:bg-accent/30"
              )}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(inv.id)}
                  className="rounded border-border shrink-0"
                  aria-label={`Select invoice ${inv.number}`}
                />
              )}
              <Link
                href={selectMode ? "#" : `/invoices/${inv.id}`}
                onClick={(e) => {
                  if (selectMode) {
                    e.preventDefault();
                    toggle(inv.id);
                  }
                }}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                    <span className="truncate">{TYPE_LABELS[inv.type]} #{inv.number}</span>
                    {inv.recurringInvoice?.isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary/10 text-primary rounded-md px-1.5 py-0.5 shrink-0">
                        <RefreshCw className="w-2.5 h-2.5" />
                        {inv.recurringInvoice.frequency.charAt(0) + inv.recurringInvoice.frequency.slice(1).toLowerCase()}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {inv.client.name} &middot; {formatDate(inv.date)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-semibold text-sm">
                    {fmt(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                  </span>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", badge.className)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.dot)} />
                    {badge.label}
                  </span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Then update `src/app/(dashboard)/invoices/page.tsx` to use the new mobile component:

```tsx
// In src/app/(dashboard)/invoices/page.tsx
// Replace the inline mobile card list (lines 194-232) with:
import { InvoiceMobileListWithBulk } from "@/components/invoices/InvoiceMobileListWithBulk";

// ... in the JSX, replace the `<div className="sm:hidden print:hidden ...">` block with:
<InvoiceMobileListWithBulk
  invoices={paginatedInvoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    type: inv.type,
    date: inv.date ? inv.date.toISOString() : null,
    total: Number(inv.total),
    currency: inv.currency,
    client: { name: inv.client.name },
    recurringInvoice: inv.recurringInvoice
      ? { isActive: inv.recurringInvoice.isActive, frequency: inv.recurringInvoice.frequency }
      : null,
  }))}
/>
```

## E1-Step 4: Add bulk operations to expenses list

### Files
- **Modify:** `src/server/routers/expenses.ts` — add `deleteMany` and `categorizeMany`
- **Modify:** `src/components/expenses/ExpenseList.tsx` — add checkbox selection and bulk action bar

### Test (write first)
- **Create:** `src/test/expenses-bulk-mutations.test.ts`

```typescript
// src/test/expenses-bulk-mutations.test.ts
import { describe, it, expect } from "vitest";

type ExpenseStub = { id: string; invoiceLineId: string | null };

export function filterDeletableExpenses(expenses: ExpenseStub[]): ExpenseStub[] {
  return expenses.filter((e) => e.invoiceLineId === null);
}

describe("filterDeletableExpenses", () => {
  it("excludes billed expenses", () => {
    const expenses: ExpenseStub[] = [
      { id: "1", invoiceLineId: null },
      { id: "2", invoiceLineId: "line_1" },
      { id: "3", invoiceLineId: null },
    ];
    const result = filterDeletableExpenses(expenses);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(["1", "3"]);
  });
});
```

### Implementation

Add two new procedures to the expenses router:

```typescript
// Add to src/server/routers/expenses.ts — after the existing delete procedure

  deleteMany: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Only delete unbilled expenses
      const deletable = await ctx.db.expense.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
          invoiceLineId: null,
        },
        select: { id: true },
      });
      const deletableIds = deletable.map((e) => e.id);
      if (deletableIds.length === 0) return { count: 0 };
      return ctx.db.expense.deleteMany({
        where: { id: { in: deletableIds }, organizationId: ctx.orgId },
      });
    }),

  categorizeMany: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
        categoryId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.expense.updateMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
        },
        data: { categoryId: input.categoryId },
      });
    }),
```

Then modify `ExpenseList.tsx` to add checkboxes and a floating action bar. Add a select-all checkbox in the table header, individual checkboxes per row, and a bulk action bar showing Delete and Categorize buttons when items are selected. Follow the same pattern as `InvoiceTableWithBulk` — use `useState<Set<string>>` for selection, floating sticky bar, `ConfirmDialog` for destructive actions. For categorize, show a dropdown of categories fetched via `trpc.expenseCategories.list.useQuery()`.

---

# E3: Scheduled Report Delivery

## E3-Step 1: Add ScheduledReport model to Prisma schema

### Files
- **Modify:** `prisma/schema.prisma`
- **Create:** `prisma/migrations/<timestamp>_add_scheduled_reports/migration.sql`

### Implementation

Add the enum and model after the EmailAutomationLog model (line ~856):

```prisma
// Add to prisma/schema.prisma — Enums section (after EmailAutomationTrigger)

enum ReportType {
  PROFIT_LOSS
  AGING
  UNPAID
  EXPENSES
  TAX_LIABILITY
}

enum ReportFrequency {
  WEEKLY
  MONTHLY
  QUARTERLY
}

// Add to prisma/schema.prisma — after EmailAutomationLog model

model ScheduledReport {
  id              String          @id @default(cuid())
  reportType      ReportType
  frequency       ReportFrequency
  dayOfWeek       Int?            // 0=Sunday...6=Saturday (for WEEKLY)
  dayOfMonth      Int?            // 1-28 (for MONTHLY/QUARTERLY)
  recipients      String[]        // email addresses
  enabled         Boolean         @default(true)
  lastSentAt      DateTime?

  organizationId  String
  organization    Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([organizationId])
  @@index([enabled])
}
```

Add to Organization model relations:

```prisma
// Add to Organization model (after emailAutomations line ~187)
  scheduledReports        ScheduledReport[]
```

Generate migration:

```bash
npx prisma migrate dev --name add_scheduled_reports
```

## E3-Step 2: Add scheduledReports router

### Files
- **Create:** `src/server/routers/scheduledReports.ts`
- **Modify:** `src/server/routers/_app.ts` — register the router

### Test (write first)
- **Create:** `src/test/scheduled-reports-validation.test.ts`

```typescript
// src/test/scheduled-reports-validation.test.ts
import { describe, it, expect } from "vitest";

type ScheduledReportInput = {
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
};

export function validateScheduleFields(input: ScheduledReportInput): string | null {
  if (input.frequency === "WEEKLY") {
    if (input.dayOfWeek === undefined || input.dayOfWeek === null) {
      return "dayOfWeek is required for WEEKLY frequency";
    }
    if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
      return "dayOfWeek must be 0-6";
    }
  }
  if (input.frequency === "MONTHLY" || input.frequency === "QUARTERLY") {
    if (input.dayOfMonth === undefined || input.dayOfMonth === null) {
      return "dayOfMonth is required for MONTHLY/QUARTERLY frequency";
    }
    if (input.dayOfMonth < 1 || input.dayOfMonth > 28) {
      return "dayOfMonth must be 1-28";
    }
  }
  return null;
}

export function isDueToday(
  now: Date,
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY",
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  lastSentAt: Date | null
): boolean {
  if (frequency === "WEEKLY") {
    if (dayOfWeek === null) return false;
    if (now.getUTCDay() !== dayOfWeek) return false;
    // Must not have been sent within last 6 days
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 6) return false;
    }
    return true;
  }
  if (frequency === "MONTHLY") {
    if (dayOfMonth === null) return false;
    if (now.getUTCDate() !== dayOfMonth) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 25) return false;
    }
    return true;
  }
  if (frequency === "QUARTERLY") {
    if (dayOfMonth === null) return false;
    if (now.getUTCDate() !== dayOfMonth) return false;
    // Quarters: months 0,3,6,9 (Jan, Apr, Jul, Oct)
    const quarterMonths = [0, 3, 6, 9];
    if (!quarterMonths.includes(now.getUTCMonth())) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 80) return false;
    }
    return true;
  }
  return false;
}

describe("validateScheduleFields", () => {
  it("requires dayOfWeek for WEEKLY", () => {
    expect(validateScheduleFields({ frequency: "WEEKLY" })).toBe(
      "dayOfWeek is required for WEEKLY frequency"
    );
  });

  it("validates dayOfWeek range", () => {
    expect(validateScheduleFields({ frequency: "WEEKLY", dayOfWeek: 7 })).toBe(
      "dayOfWeek must be 0-6"
    );
  });

  it("accepts valid WEEKLY", () => {
    expect(validateScheduleFields({ frequency: "WEEKLY", dayOfWeek: 1 })).toBeNull();
  });

  it("requires dayOfMonth for MONTHLY", () => {
    expect(validateScheduleFields({ frequency: "MONTHLY" })).toBe(
      "dayOfMonth is required for MONTHLY/QUARTERLY frequency"
    );
  });

  it("validates dayOfMonth range", () => {
    expect(validateScheduleFields({ frequency: "MONTHLY", dayOfMonth: 31 })).toBe(
      "dayOfMonth must be 1-28"
    );
  });

  it("accepts valid MONTHLY", () => {
    expect(validateScheduleFields({ frequency: "MONTHLY", dayOfMonth: 15 })).toBeNull();
  });

  it("accepts valid QUARTERLY", () => {
    expect(validateScheduleFields({ frequency: "QUARTERLY", dayOfMonth: 1 })).toBeNull();
  });
});

describe("isDueToday", () => {
  it("returns true for matching WEEKLY day", () => {
    // 2026-04-06 is a Monday (day 1)
    const now = new Date("2026-04-06T10:00:00Z");
    expect(isDueToday(now, "WEEKLY", 1, null, null)).toBe(true);
  });

  it("returns false for non-matching WEEKLY day", () => {
    const now = new Date("2026-04-06T10:00:00Z"); // Monday
    expect(isDueToday(now, "WEEKLY", 5, null, null)).toBe(false);
  });

  it("returns false if sent within last 6 days (WEEKLY)", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    const lastSent = new Date("2026-04-01T10:00:00Z"); // 5 days ago
    expect(isDueToday(now, "WEEKLY", 1, null, lastSent)).toBe(false);
  });

  it("returns true for matching MONTHLY day", () => {
    const now = new Date("2026-04-15T10:00:00Z");
    expect(isDueToday(now, "MONTHLY", 15, null, null)).toBe(true);
  });

  it("returns false for QUARTERLY on non-quarter month", () => {
    const now = new Date("2026-05-01T10:00:00Z"); // May is not a quarter start
    expect(isDueToday(now, "QUARTERLY", null, 1, null)).toBe(false);
  });

  it("returns true for QUARTERLY on quarter month", () => {
    const now = new Date("2026-04-01T10:00:00Z"); // April = month 3 = quarter start
    expect(isDueToday(now, "QUARTERLY", null, 1, null)).toBe(true);
  });
});
```

### Implementation

```typescript
// src/server/routers/scheduledReports.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";

export const scheduledReportsRouter = router({
  list: requireRole("OWNER", "ADMIN")
    .query(async ({ ctx }) => {
      return ctx.db.scheduledReport.findMany({
        where: { organizationId: ctx.orgId },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        reportType: z.enum(["PROFIT_LOSS", "AGING", "UNPAID", "EXPENSES", "TAX_LIABILITY"]),
        frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]),
        dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
        dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
        recipients: z.array(z.string().email()).min(1).max(10),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate frequency-specific fields
      if (input.frequency === "WEEKLY" && (input.dayOfWeek === undefined || input.dayOfWeek === null)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "dayOfWeek is required for WEEKLY frequency" });
      }
      if ((input.frequency === "MONTHLY" || input.frequency === "QUARTERLY") &&
          (input.dayOfMonth === undefined || input.dayOfMonth === null)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "dayOfMonth is required for MONTHLY/QUARTERLY frequency" });
      }

      return ctx.db.scheduledReport.create({
        data: {
          reportType: input.reportType,
          frequency: input.frequency,
          dayOfWeek: input.dayOfWeek ?? null,
          dayOfMonth: input.dayOfMonth ?? null,
          recipients: input.recipients,
          enabled: input.enabled,
          organizationId: ctx.orgId,
        },
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        reportType: z.enum(["PROFIT_LOSS", "AGING", "UNPAID", "EXPENSES", "TAX_LIABILITY"]).optional(),
        frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]).optional(),
        dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
        dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
        recipients: z.array(z.string().email()).min(1).max(10).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.scheduledReport.findFirst({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled report not found" });
      }
      return ctx.db.scheduledReport.update({ where: { id }, data });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.scheduledReport.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled report not found" });
      }
      await ctx.db.scheduledReport.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

Register in `_app.ts`:

```typescript
// Add import
import { scheduledReportsRouter } from "./scheduledReports";

// Add to appRouter
  scheduledReports: scheduledReportsRouter,
```

## E3-Step 3: Create report PDF generation service

### Files
- **Create:** `src/server/services/report-pdf-generator.ts`

### Implementation

This service generates HTML report content (same data as the existing report pages) and converts to PDF via the same approach used by `/api/invoices/[id]/pdf`. It calls the existing tRPC report procedures internally.

```typescript
// src/server/services/report-pdf-generator.ts
import { db } from "@/server/db";
import { InvoiceStatus, InvoiceType, type ReportType } from "@/generated/prisma";

export type ReportData = {
  title: string;
  html: string;
  generatedAt: Date;
};

/**
 * Generates report HTML suitable for PDF conversion.
 * Each report type queries the same data as the tRPC report procedures.
 */
export async function generateReportHtml(
  orgId: string,
  reportType: ReportType,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  const orgName = org?.name ?? "Organization";
  const now = new Date();

  switch (reportType) {
    case "PROFIT_LOSS":
      return generateProfitLossReport(orgId, orgName, dateRange);
    case "AGING":
      return generateAgingReport(orgId, orgName);
    case "UNPAID":
      return generateUnpaidReport(orgId, orgName, dateRange);
    case "EXPENSES":
      return generateExpensesReport(orgId, orgName, dateRange);
    case "TAX_LIABILITY":
      return generateTaxLiabilityReport(orgId, orgName, dateRange);
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

async function generateProfitLossReport(
  orgId: string,
  orgName: string,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const dateFilter = dateRange?.from || dateRange?.to
    ? { ...(dateRange.from ? { gte: dateRange.from } : {}), ...(dateRange.to ? { lte: dateRange.to } : {}) }
    : undefined;

  const [payments, expenses] = await Promise.all([
    db.payment.findMany({
      where: { organizationId: orgId, ...(dateFilter ? { paidAt: dateFilter } : {}) },
      select: { amount: true },
    }),
    db.expense.findMany({
      where: { organizationId: orgId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      select: { rate: true, qty: true },
    }),
  ]);

  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.rate) * e.qty, 0);
  const netIncome = totalRevenue - totalExpenses;

  const html = `
    <h1>${orgName} - Profit & Loss Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;">
        <th style="text-align:left; padding:8px;">Category</th>
        <th style="text-align:right; padding:8px;">Amount</th>
      </tr>
      <tr><td style="padding:8px;">Total Revenue</td><td style="text-align:right; padding:8px;">$${totalRevenue.toFixed(2)}</td></tr>
      <tr><td style="padding:8px;">Total Expenses</td><td style="text-align:right; padding:8px;">$${totalExpenses.toFixed(2)}</td></tr>
      <tr style="border-top:2px solid #000; font-weight:bold;">
        <td style="padding:8px;">Net Income</td><td style="text-align:right; padding:8px;">$${netIncome.toFixed(2)}</td>
      </tr>
    </table>
  `;

  return { title: "Profit & Loss Report", html, generatedAt: new Date() };
}

async function generateAgingReport(orgId: string, orgName: string): Promise<ReportData> {
  const now = new Date();
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: orgId,
      isArchived: false,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
    },
    include: { client: { select: { name: true } }, currency: true },
    orderBy: { dueDate: "asc" },
  });

  const buckets = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of invoices) {
    const days = inv.dueDate ? Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000) : 0;
    const amount = Number(inv.total);
    if (days <= 0) buckets.current += amount;
    else if (days <= 30) buckets["1-30"] += amount;
    else if (days <= 60) buckets["31-60"] += amount;
    else if (days <= 90) buckets["61-90"] += amount;
    else buckets["90+"] += amount;
  }

  const rows = Object.entries(buckets)
    .map(([k, v]) => `<tr><td style="padding:8px;">${k} days</td><td style="text-align:right; padding:8px;">$${v.toFixed(2)}</td></tr>`)
    .join("");

  const total = Object.values(buckets).reduce((s, v) => s + v, 0);

  const html = `
    <h1>${orgName} - Aging Report</h1>
    <p>Generated: ${now.toLocaleDateString()}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;"><th style="text-align:left; padding:8px;">Bucket</th><th style="text-align:right; padding:8px;">Amount</th></tr>
      ${rows}
      <tr style="border-top:2px solid #000; font-weight:bold;"><td style="padding:8px;">Total</td><td style="text-align:right; padding:8px;">$${total.toFixed(2)}</td></tr>
    </table>
  `;

  return { title: "Invoice Aging Report", html, generatedAt: now };
}

async function generateUnpaidReport(
  orgId: string,
  orgName: string,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: orgId,
      isArchived: false,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      ...(dateRange?.from || dateRange?.to
        ? { date: { ...(dateRange.from ? { gte: dateRange.from } : {}), ...(dateRange.to ? { lte: dateRange.to } : {}) } }
        : {}),
    },
    include: { client: { select: { name: true } }, currency: true },
    orderBy: { dueDate: "asc" },
  });

  const rows = invoices.map((inv) => `
    <tr>
      <td style="padding:8px;">#${inv.number}</td>
      <td style="padding:8px;">${inv.client.name}</td>
      <td style="padding:8px;">${inv.status}</td>
      <td style="padding:8px;">${inv.dueDate?.toLocaleDateString() ?? "\u2014"}</td>
      <td style="text-align:right; padding:8px;">$${Number(inv.total).toFixed(2)}</td>
    </tr>
  `).join("");

  const total = invoices.reduce((s, inv) => s + Number(inv.total), 0);

  const html = `
    <h1>${orgName} - Unpaid Invoices Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()} | ${invoices.length} invoices</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;">
        <th style="text-align:left; padding:8px;">Invoice</th>
        <th style="text-align:left; padding:8px;">Client</th>
        <th style="text-align:left; padding:8px;">Status</th>
        <th style="text-align:left; padding:8px;">Due Date</th>
        <th style="text-align:right; padding:8px;">Amount</th>
      </tr>
      ${rows}
      <tr style="border-top:2px solid #000; font-weight:bold;">
        <td colspan="4" style="padding:8px;">Total</td>
        <td style="text-align:right; padding:8px;">$${total.toFixed(2)}</td>
      </tr>
    </table>
  `;

  return { title: "Unpaid Invoices Report", html, generatedAt: new Date() };
}

async function generateExpensesReport(
  orgId: string,
  orgName: string,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const expenses = await db.expense.findMany({
    where: {
      organizationId: orgId,
      ...(dateRange?.from || dateRange?.to
        ? { createdAt: { ...(dateRange.from ? { gte: dateRange.from } : {}), ...(dateRange.to ? { lte: dateRange.to } : {}) } }
        : {}),
    },
    include: { category: true, supplier: true },
    orderBy: { createdAt: "desc" },
  });

  const rows = expenses.map((e) => `
    <tr>
      <td style="padding:8px;">${e.name}</td>
      <td style="padding:8px;">${e.category?.name ?? "\u2014"}</td>
      <td style="padding:8px;">${e.supplier?.name ?? "\u2014"}</td>
      <td style="text-align:right; padding:8px;">$${(Number(e.rate) * e.qty).toFixed(2)}</td>
    </tr>
  `).join("");

  const total = expenses.reduce((s, e) => s + Number(e.rate) * e.qty, 0);

  const html = `
    <h1>${orgName} - Expenses Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()} | ${expenses.length} expenses</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;">
        <th style="text-align:left; padding:8px;">Name</th>
        <th style="text-align:left; padding:8px;">Category</th>
        <th style="text-align:left; padding:8px;">Supplier</th>
        <th style="text-align:right; padding:8px;">Amount</th>
      </tr>
      ${rows}
      <tr style="border-top:2px solid #000; font-weight:bold;">
        <td colspan="3" style="padding:8px;">Total</td>
        <td style="text-align:right; padding:8px;">$${total.toFixed(2)}</td>
      </tr>
    </table>
  `;

  return { title: "Expenses Report", html, generatedAt: new Date() };
}

async function generateTaxLiabilityReport(
  orgId: string,
  orgName: string,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const lineTaxes = await db.invoiceLineTax.findMany({
    where: {
      invoiceLine: {
        invoice: {
          organizationId: orgId,
          isArchived: false,
          status: { notIn: ["DRAFT"] },
          type: { not: InvoiceType.CREDIT_NOTE },
          ...(dateRange?.from || dateRange?.to
            ? { date: { ...(dateRange.from ? { gte: dateRange.from } : {}), ...(dateRange.to ? { lte: dateRange.to } : {}) } }
            : {}),
        },
      },
    },
    include: { tax: true },
  });

  const byTax = new Map<string, { name: string; rate: number; total: number }>();
  for (const lt of lineTaxes) {
    const key = lt.taxId;
    if (!byTax.has(key)) byTax.set(key, { name: lt.tax.name, rate: Number(lt.tax.rate), total: 0 });
    byTax.get(key)!.total += Number(lt.taxAmount);
  }

  const rows = Array.from(byTax.values())
    .sort((a, b) => b.total - a.total)
    .map((t) => `<tr><td style="padding:8px;">${t.name} (${t.rate}%)</td><td style="text-align:right; padding:8px;">$${t.total.toFixed(2)}</td></tr>`)
    .join("");

  const grandTotal = Array.from(byTax.values()).reduce((s, t) => s + t.total, 0);

  const html = `
    <h1>${orgName} - Tax Liability Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;"><th style="text-align:left; padding:8px;">Tax</th><th style="text-align:right; padding:8px;">Collected</th></tr>
      ${rows}
      <tr style="border-top:2px solid #000; font-weight:bold;"><td style="padding:8px;">Grand Total</td><td style="text-align:right; padding:8px;">$${grandTotal.toFixed(2)}</td></tr>
    </table>
  `;

  return { title: "Tax Liability Report", html, generatedAt: new Date() };
}
```

## E3-Step 4: Create Inngest cron for scheduled report delivery

### Files
- **Create:** `src/inngest/functions/scheduled-reports.ts`
- **Modify:** `src/app/api/inngest/route.ts` — register the function

### Test (write first)

The `isDueToday` pure function is already tested in E3-Step 2.

### Implementation

```typescript
// src/inngest/functions/scheduled-reports.ts
import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";
import { generateReportHtml } from "@/server/services/report-pdf-generator";

/**
 * Checks if a scheduled report is due today.
 */
export function isDueToday(
  now: Date,
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY",
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  lastSentAt: Date | null
): boolean {
  if (frequency === "WEEKLY") {
    if (dayOfWeek === null) return false;
    if (now.getUTCDay() !== dayOfWeek) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 6) return false;
    }
    return true;
  }
  if (frequency === "MONTHLY") {
    if (dayOfMonth === null) return false;
    if (now.getUTCDate() !== dayOfMonth) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 25) return false;
    }
    return true;
  }
  if (frequency === "QUARTERLY") {
    if (dayOfMonth === null) return false;
    if (now.getUTCDate() !== dayOfMonth) return false;
    const quarterMonths = [0, 3, 6, 9];
    if (!quarterMonths.includes(now.getUTCMonth())) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 80) return false;
    }
    return true;
  }
  return false;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  PROFIT_LOSS: "Profit & Loss",
  AGING: "Invoice Aging",
  UNPAID: "Unpaid Invoices",
  EXPENSES: "Expenses",
  TAX_LIABILITY: "Tax Liability",
};

export const processScheduledReports = inngest.createFunction(
  { id: "process-scheduled-reports", name: "Process Scheduled Reports" },
  { cron: "0 7 * * *" }, // daily at 7am UTC
  async () => {
    const now = new Date();

    const schedules = await db.scheduledReport.findMany({
      where: { enabled: true },
      include: { organization: { select: { name: true } } },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const schedule of schedules) {
      if (!isDueToday(now, schedule.frequency, schedule.dayOfWeek, schedule.dayOfMonth, schedule.lastSentAt)) {
        skipped++;
        continue;
      }

      try {
        const reportData = await generateReportHtml(schedule.organizationId, schedule.reportType);

        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const bcc = await getOwnerBcc(schedule.organizationId);

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "reports@example.com",
          to: schedule.recipients,
          subject: `${REPORT_TYPE_LABELS[schedule.reportType] ?? schedule.reportType} Report - ${schedule.organization.name}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
              ${reportData.html}
              <hr style="margin-top: 30px; border: none; border-top: 1px solid #e5e7eb;" />
              <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
                This is an automated report from ${schedule.organization.name}.
                Manage your scheduled reports in Settings > Reports.
              </p>
            </div>
          `,
          ...(bcc ? { bcc } : {}),
        });

        await db.scheduledReport.update({
          where: { id: schedule.id },
          data: { lastSentAt: now },
        });

        sent++;
      } catch (err) {
        console.error(`[scheduled-reports] Failed to send ${schedule.reportType} for org ${schedule.organizationId}:`, err);
        failed++;
      }
    }

    return { processed: schedules.length, sent, skipped, failed };
  }
);
```

Register in `src/app/api/inngest/route.ts`:

```typescript
// Add import
import { processScheduledReports } from "@/inngest/functions/scheduled-reports";

// Add to functions array
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processRecurringInvoices, processOverdueInvoices, processPaymentReminders,
    cleanupPendingUsers, processRecurringExpenses, processEmailAutomations,
    handleAutomationEvent, processLateFees, processScheduledReports,
  ],
});
```

## E3-Step 5: Create settings page for scheduled reports

### Files
- **Create:** `src/app/(dashboard)/settings/reports/page.tsx`
- **Create:** `src/components/settings/ScheduledReportForm.tsx`
- **Create:** `src/components/settings/ScheduledReportList.tsx`

### Implementation

Follow the same pattern as `src/app/(dashboard)/settings/automations/page.tsx` with `AutomationForm` and `AutomationList`.

```tsx
// src/app/(dashboard)/settings/reports/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScheduledReportList } from "@/components/settings/ScheduledReportList";
import { ScheduledReportForm } from "@/components/settings/ScheduledReportForm";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ScheduledReportsSettingsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function handleEdit(id: string) {
    setEditId(id);
    setShowForm(true);
  }

  function handleClose() {
    setShowForm(false);
    setEditId(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Scheduled Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Automatically generate and email reports on a recurring schedule.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              New Schedule
            </Button>
          )}
        </div>
      </div>

      {showForm && <ScheduledReportForm editId={editId} onClose={handleClose} />}
      <ScheduledReportList onEdit={handleEdit} />
    </div>
  );
}
```

```tsx
// src/components/settings/ScheduledReportForm.tsx
"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const REPORT_TYPES = [
  { value: "PROFIT_LOSS", label: "Profit & Loss" },
  { value: "AGING", label: "Invoice Aging" },
  { value: "UNPAID", label: "Unpaid Invoices" },
  { value: "EXPENSES", label: "Expenses" },
  { value: "TAX_LIABILITY", label: "Tax Liability" },
] as const;

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
] as const;

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Props = {
  editId: string | null;
  onClose: () => void;
};

export function ScheduledReportForm({ editId, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: schedules } = trpc.scheduledReports.list.useQuery();
  const existing = editId ? schedules?.find((s) => s.id === editId) : null;

  const [reportType, setReportType] = useState(existing?.reportType ?? "PROFIT_LOSS");
  const [frequency, setFrequency] = useState(existing?.frequency ?? "MONTHLY");
  const [dayOfWeek, setDayOfWeek] = useState<number>(existing?.dayOfWeek ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(existing?.dayOfMonth ?? 1);
  const [recipients, setRecipients] = useState(existing?.recipients?.join(", ") ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);

  useEffect(() => {
    if (existing) {
      setReportType(existing.reportType);
      setFrequency(existing.frequency);
      setDayOfWeek(existing.dayOfWeek ?? 1);
      setDayOfMonth(existing.dayOfMonth ?? 1);
      setRecipients(existing.recipients.join(", "));
      setEnabled(existing.enabled);
    }
  }, [existing]);

  const createMutation = trpc.scheduledReports.create.useMutation({
    onSuccess: () => {
      toast.success("Schedule created");
      utils.scheduledReports.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.scheduledReports.update.useMutation({
    onSuccess: () => {
      toast.success("Schedule updated");
      utils.scheduledReports.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedRecipients = recipients.split(",").map((r) => r.trim()).filter(Boolean);
    if (parsedRecipients.length === 0) {
      toast.error("At least one recipient email is required");
      return;
    }

    const data = {
      reportType: reportType as any,
      frequency: frequency as any,
      dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : null,
      dayOfMonth: frequency !== "WEEKLY" ? dayOfMonth : null,
      recipients: parsedRecipients,
      enabled,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Report Type</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {REPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {frequency === "WEEKLY" && (
        <div>
          <label className="text-sm font-medium">Day of Week</label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {DAYS_OF_WEEK.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </div>
      )}

      {(frequency === "MONTHLY" || frequency === "QUARTERLY") && (
        <div>
          <label className="text-sm font-medium">Day of Month (1-28)</label>
          <input
            type="number"
            min={1}
            max={28}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Recipients (comma-separated emails)</label>
        <input
          type="text"
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="owner@example.com, accountant@example.com"
          className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-border"
        />
        <label htmlFor="enabled" className="text-sm">Enabled</label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isLoading}>
          {editId ? "Update" : "Create"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

```tsx
// src/components/settings/ScheduledReportList.tsx
"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

const REPORT_LABELS: Record<string, string> = {
  PROFIT_LOSS: "Profit & Loss",
  AGING: "Invoice Aging",
  UNPAID: "Unpaid Invoices",
  EXPENSES: "Expenses",
  TAX_LIABILITY: "Tax Liability",
};

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  onEdit: (id: string) => void;
};

export function ScheduledReportList({ onEdit }: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: schedules = [] } = trpc.scheduledReports.list.useQuery();

  const deleteMutation = trpc.scheduledReports.delete.useMutation({
    onSuccess: () => {
      toast.success("Schedule deleted");
      utils.scheduledReports.list.invalidate();
      setDeleteId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteId(null);
    },
  });

  if (schedules.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        No scheduled reports yet. Create one to get started.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Report</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipients</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Sent</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {schedules.map((s) => (
              <tr key={s.id} className="hover:bg-accent/20 transition-colors">
                <td className="px-5 py-3.5 font-medium">{REPORT_LABELS[s.reportType] ?? s.reportType}</td>
                <td className="px-5 py-3.5 text-muted-foreground">
                  {FREQUENCY_LABELS[s.frequency] ?? s.frequency}
                  {s.frequency === "WEEKLY" && s.dayOfWeek !== null && ` on ${DAYS_OF_WEEK[s.dayOfWeek]}`}
                  {s.frequency !== "WEEKLY" && s.dayOfMonth !== null && ` on day ${s.dayOfMonth}`}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">{s.recipients.join(", ")}</td>
                <td className="px-5 py-3.5">
                  {s.enabled ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">Active</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Paused</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">
                  {s.lastSentAt ? new Date(s.lastSentAt).toLocaleDateString() : "\u2014"}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(s.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(s.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete scheduled report"
        description="This will stop all future deliveries of this report."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        loading={deleteMutation.isPending}
        destructive
      />
    </>
  );
}
```

Also add the link to the main settings page. In `src/app/(dashboard)/settings/page.tsx`, add a card/link for "Scheduled Reports" pointing to `/settings/reports`.

---

# E2: Auto-Reminder Escalation

## E2-Step 1: Add ReminderSequence, ReminderStep, and ReminderLog models

### Files
- **Modify:** `prisma/schema.prisma`
- **Create:** `prisma/migrations/<timestamp>_add_reminder_sequences/migration.sql`

### Implementation

Add after the ScheduledReport model:

```prisma
// ─── Reminder Sequences ──────────────────────────────────────────────────────

model ReminderSequence {
  id              String   @id @default(cuid())
  name            String
  isDefault       Boolean  @default(false)
  enabled         Boolean  @default(true)

  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  steps           ReminderStep[]
  invoices        Invoice[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([organizationId])
}

model ReminderStep {
  id                  String   @id @default(cuid())
  daysRelativeToDue   Int      // negative = before due, 0 = on due, positive = after due
  subject             String
  body                String
  sort                Int      @default(0)

  sequenceId          String
  sequence            ReminderSequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)

  logs                ReminderLog[]

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([sequenceId])
}

model ReminderLog {
  id         String   @id @default(cuid())
  sentAt     DateTime @default(now())

  stepId     String
  step       ReminderStep @relation(fields: [stepId], references: [id], onDelete: Cascade)
  invoiceId  String

  @@unique([stepId, invoiceId])   // prevents double-sends
  @@index([invoiceId])
}
```

Add to Organization model relations:

```prisma
  reminderSequences       ReminderSequence[]
```

Add to Invoice model:

```prisma
  // Optional per-invoice reminder sequence override
  reminderSequenceId  String?
  reminderSequence    ReminderSequence? @relation(fields: [reminderSequenceId], references: [id], onDelete: SetNull)
```

Generate migration:

```bash
npx prisma migrate dev --name add_reminder_sequences
```

## E2-Step 2: Create reminder sequences router

### Files
- **Create:** `src/server/routers/reminderSequences.ts`
- **Modify:** `src/server/routers/_app.ts` — register the router

### Test (write first)
- **Create:** `src/test/reminder-sequences-validation.test.ts`

```typescript
// src/test/reminder-sequences-validation.test.ts
import { describe, it, expect } from "vitest";

type ReminderStepInput = {
  daysRelativeToDue: number;
  subject: string;
  body: string;
  sort: number;
};

/**
 * Validates that steps are in chronological order by daysRelativeToDue
 */
export function validateStepOrder(steps: ReminderStepInput[]): string | null {
  const sorted = [...steps].sort((a, b) => a.sort - b.sort);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].daysRelativeToDue < sorted[i - 1].daysRelativeToDue) {
      return `Step ${i + 1} (day ${sorted[i].daysRelativeToDue}) is before step ${i} (day ${sorted[i - 1].daysRelativeToDue}) chronologically but has a later sort order`;
    }
  }
  return null;
}

/**
 * Determines which reminder step should fire today for a given invoice.
 */
export function getStepDueToday(
  now: Date,
  dueDate: Date,
  steps: { id: string; daysRelativeToDue: number }[],
  sentStepIds: Set<string>
): { id: string; daysRelativeToDue: number } | null {
  const dueMidnight = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysFromDue = Math.round((nowMidnight - dueMidnight) / 86400000);

  // Find the step that matches today (daysRelativeToDue == daysFromDue)
  // and hasn't been sent yet
  for (const step of steps) {
    if (step.daysRelativeToDue === daysFromDue && !sentStepIds.has(step.id)) {
      return step;
    }
  }
  return null;
}

describe("validateStepOrder", () => {
  it("returns null for valid chronological order", () => {
    const steps: ReminderStepInput[] = [
      { daysRelativeToDue: -3, subject: "s", body: "b", sort: 0 },
      { daysRelativeToDue: 0, subject: "s", body: "b", sort: 1 },
      { daysRelativeToDue: 7, subject: "s", body: "b", sort: 2 },
    ];
    expect(validateStepOrder(steps)).toBeNull();
  });

  it("detects out-of-order steps", () => {
    const steps: ReminderStepInput[] = [
      { daysRelativeToDue: 7, subject: "s", body: "b", sort: 0 },
      { daysRelativeToDue: -3, subject: "s", body: "b", sort: 1 },
    ];
    expect(validateStepOrder(steps)).toContain("before step");
  });
});

describe("getStepDueToday", () => {
  it("returns matching step for today", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-07T10:00:00Z"); // 3 days before due = -3
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
      { id: "s3", daysRelativeToDue: 7 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set());
    expect(result?.id).toBe("s1");
  });

  it("skips already-sent steps", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-07T10:00:00Z"); // -3
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set(["s1"]));
    expect(result).toBeNull();
  });

  it("returns null when no step matches today", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-05T10:00:00Z"); // -5, no step for this
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set());
    expect(result).toBeNull();
  });

  it("matches on-due-date step", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-10T10:00:00Z"); // day 0
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
      { id: "s3", daysRelativeToDue: 7 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set(["s1"]));
    expect(result?.id).toBe("s2");
  });

  it("matches post-due-date step", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-17T10:00:00Z"); // +7
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
      { id: "s3", daysRelativeToDue: 7 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set(["s1", "s2"]));
    expect(result?.id).toBe("s3");
  });
});
```

### Implementation

```typescript
// src/server/routers/reminderSequences.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole, protectedProcedure } from "../trpc";

const stepSchema = z.object({
  daysRelativeToDue: z.number().int().min(-90).max(365),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  sort: z.number().int().default(0),
});

export const reminderSequencesRouter = router({
  list: requireRole("OWNER", "ADMIN")
    .query(async ({ ctx }) => {
      return ctx.db.reminderSequence.findMany({
        where: { organizationId: ctx.orgId },
        include: {
          steps: { orderBy: { sort: "asc" } },
          _count: { select: { invoices: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const sequence = await ctx.db.reminderSequence.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          steps: {
            orderBy: { sort: "asc" },
            include: {
              _count: { select: { logs: true } },
            },
          },
        },
      });
      if (!sequence) throw new TRPCError({ code: "NOT_FOUND" });
      return sequence;
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        name: z.string().min(1).max(100),
        isDefault: z.boolean().default(false),
        enabled: z.boolean().default(true),
        steps: z.array(stepSchema).min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        // If setting as default, unset other defaults
        if (input.isDefault) {
          await tx.reminderSequence.updateMany({
            where: { organizationId: ctx.orgId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.reminderSequence.create({
          data: {
            name: input.name,
            isDefault: input.isDefault,
            enabled: input.enabled,
            organizationId: ctx.orgId,
            steps: {
              create: input.steps.map((step, i) => ({
                daysRelativeToDue: step.daysRelativeToDue,
                subject: step.subject,
                body: step.body,
                sort: step.sort ?? i,
              })),
            },
          },
          include: { steps: { orderBy: { sort: "asc" } } },
        });
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        isDefault: z.boolean().optional(),
        enabled: z.boolean().optional(),
        steps: z.array(stepSchema).min(1).max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, steps, ...data } = input;
      const existing = await ctx.db.reminderSequence.findFirst({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.$transaction(async (tx) => {
        if (data.isDefault) {
          await tx.reminderSequence.updateMany({
            where: { organizationId: ctx.orgId, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }

        if (steps) {
          // Delete old steps and create new ones
          await tx.reminderStep.deleteMany({ where: { sequenceId: id } });
          await tx.reminderStep.createMany({
            data: steps.map((step, i) => ({
              sequenceId: id,
              daysRelativeToDue: step.daysRelativeToDue,
              subject: step.subject,
              body: step.body,
              sort: step.sort ?? i,
            })),
          });
        }

        return tx.reminderSequence.update({
          where: { id },
          data,
          include: { steps: { orderBy: { sort: "asc" } } },
        });
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.reminderSequence.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Clear references from invoices
      await ctx.db.invoice.updateMany({
        where: { reminderSequenceId: input.id },
        data: { reminderSequenceId: null },
      });

      await ctx.db.reminderSequence.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Get reminder history for a specific invoice
  getInvoiceLogs: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify invoice belongs to this org
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.reminderLog.findMany({
        where: { invoiceId: input.invoiceId },
        include: {
          step: {
            select: { daysRelativeToDue: true, subject: true, sequence: { select: { name: true } } },
          },
        },
        orderBy: { sentAt: "desc" },
      });
    }),
});
```

Register in `_app.ts`:

```typescript
import { reminderSequencesRouter } from "./reminderSequences";

// In appRouter:
  reminderSequences: reminderSequencesRouter,
```

## E2-Step 3: Create Inngest cron for reminder sequence evaluation

### Files
- **Create:** `src/inngest/functions/reminder-sequences.ts`
- **Modify:** `src/app/api/inngest/route.ts` — register the function

### Implementation

```typescript
// src/inngest/functions/reminder-sequences.ts
import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";
import {
  interpolateTemplate,
  buildTemplateVariables,
} from "@/server/services/automation-template";

/**
 * Determines which step fires today for a given invoice.
 * Returns null if no step is due or all matching steps have been sent.
 */
export function getStepDueToday(
  now: Date,
  dueDate: Date,
  steps: { id: string; daysRelativeToDue: number }[],
  sentStepIds: Set<string>
): { id: string; daysRelativeToDue: number } | null {
  const dueMidnight = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysFromDue = Math.round((nowMidnight - dueMidnight) / 86400000);

  for (const step of steps) {
    if (step.daysRelativeToDue === daysFromDue && !sentStepIds.has(step.id)) {
      return step;
    }
  }
  return null;
}

export const processReminderSequences = inngest.createFunction(
  { id: "process-reminder-sequences", name: "Process Reminder Sequences" },
  { cron: "0 8 * * *" }, // daily at 8am UTC
  async () => {
    const now = new Date();

    // 1. Fetch all enabled sequences with their steps
    const sequences = await db.reminderSequence.findMany({
      where: { enabled: true },
      include: { steps: { orderBy: { sort: "asc" } } },
    });

    if (!sequences.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

    // Build lookup: orgId -> sequences
    const orgSequences = new Map<string, typeof sequences>();
    for (const seq of sequences) {
      const list = orgSequences.get(seq.organizationId) ?? [];
      list.push(seq);
      orgSequences.set(seq.organizationId, list);
    }

    // 2. Fetch unpaid invoices with due dates for these orgs
    const orgIds = [...orgSequences.keys()];
    const invoices = await db.invoice.findMany({
      where: {
        organizationId: { in: orgIds },
        isArchived: false,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        dueDate: { not: null },
        type: { in: ["SIMPLE", "DETAILED"] },
      },
      include: {
        client: true,
        organization: { select: { name: true } },
        currency: true,
      },
    });

    // 3. Fetch existing reminder logs for these invoices
    const invoiceIds = invoices.map((i) => i.id);
    const allStepIds = sequences.flatMap((s) => s.steps.map((st) => st.id));
    const existingLogs = await db.reminderLog.findMany({
      where: {
        invoiceId: { in: invoiceIds },
        stepId: { in: allStepIds },
      },
      select: { stepId: true, invoiceId: true },
    });

    // Build lookup: invoiceId -> Set<stepId>
    const sentMap = new Map<string, Set<string>>();
    for (const log of existingLogs) {
      const set = sentMap.get(log.invoiceId) ?? new Set();
      set.add(log.stepId);
      sentMap.set(log.invoiceId, set);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // 4. Process each invoice
    for (const invoice of invoices) {
      if (!invoice.dueDate || !invoice.client.email) {
        skipped++;
        continue;
      }

      // Determine which sequence applies:
      // 1. Invoice-level override (reminderSequenceId)
      // 2. Org default sequence (isDefault)
      const orgSeqs = orgSequences.get(invoice.organizationId) ?? [];
      let sequence = invoice.reminderSequenceId
        ? orgSeqs.find((s) => s.id === invoice.reminderSequenceId)
        : orgSeqs.find((s) => s.isDefault);

      if (!sequence) {
        skipped++;
        continue;
      }

      const sentStepIds = sentMap.get(invoice.id) ?? new Set();
      const step = getStepDueToday(now, invoice.dueDate, sequence.steps, sentStepIds);

      if (!step) {
        skipped++;
        continue;
      }

      // Retrieve the full step data
      const fullStep = sequence.steps.find((s) => s.id === step.id);
      if (!fullStep) {
        skipped++;
        continue;
      }

      try {
        // Build template variables
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com";
        const vars = buildTemplateVariables({
          clientName: invoice.client.name,
          invoiceNumber: invoice.number,
          amountDue: Number(invoice.total).toFixed(2),
          dueDate: invoice.dueDate.toLocaleDateString(),
          portalToken: invoice.portalToken,
          orgName: invoice.organization.name,
        });

        const subject = interpolateTemplate(fullStep.subject, vars);
        const body = interpolateTemplate(fullStep.body, vars);

        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const bcc = await getOwnerBcc(invoice.organizationId);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "reminders@example.com",
          to: invoice.client.email,
          subject,
          html: body,
          ...(bcc ? { bcc } : {}),
        });

        // Log the send to prevent double-sends
        await db.reminderLog.create({
          data: {
            stepId: fullStep.id,
            invoiceId: invoice.id,
          },
        });

        sent++;
      } catch (err) {
        console.error(`[reminder-sequences] Failed to send for invoice ${invoice.number}:`, err);
        failed++;
      }
    }

    return { processed: invoices.length, sent, skipped, failed };
  }
);
```

Register in Inngest route:

```typescript
import { processReminderSequences } from "@/inngest/functions/reminder-sequences";

// Add to functions array
functions: [...existing, processReminderSequences],
```

## E2-Step 4: Create settings page for reminder sequences

### Files
- **Create:** `src/app/(dashboard)/settings/reminders/page.tsx`
- **Create:** `src/components/settings/ReminderSequenceForm.tsx`
- **Create:** `src/components/settings/ReminderSequenceList.tsx`

### Implementation

Follow the same pattern as the automations settings page.

```tsx
// src/app/(dashboard)/settings/reminders/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReminderSequenceList } from "@/components/settings/ReminderSequenceList";
import { ReminderSequenceForm } from "@/components/settings/ReminderSequenceForm";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RemindersSettingsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function handleEdit(id: string) {
    setEditId(id);
    setShowForm(true);
  }

  function handleClose() {
    setShowForm(false);
    setEditId(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reminder Sequences</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure automatic reminder emails sent at specific intervals relative to invoice due dates.
              Uses template variables: {"{{ clientName }}"}, {"{{ invoiceNumber }}"}, {"{{ amountDue }}"}, {"{{ dueDate }}"}, {"{{ paymentLink }}"}, {"{{ orgName }}"}.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              New Sequence
            </Button>
          )}
        </div>
      </div>

      {showForm && <ReminderSequenceForm editId={editId} onClose={handleClose} />}
      <ReminderSequenceList onEdit={handleEdit} />
    </div>
  );
}
```

```tsx
// src/components/settings/ReminderSequenceForm.tsx
"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type StepInput = {
  daysRelativeToDue: number;
  subject: string;
  body: string;
  sort: number;
};

const DEFAULT_STEPS: StepInput[] = [
  { daysRelativeToDue: -3, subject: "Upcoming: Invoice #{{ invoiceNumber }} due in 3 days", body: "<p>Hi {{ clientName }},</p><p>This is a friendly reminder that Invoice #{{ invoiceNumber }} for {{ amountDue }} is due on {{ dueDate }}.</p><p><a href=\"{{ paymentLink }}\">View & Pay</a></p><p>{{ orgName }}</p>", sort: 0 },
  { daysRelativeToDue: 0, subject: "Due today: Invoice #{{ invoiceNumber }}", body: "<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is due today.</p><p><a href=\"{{ paymentLink }}\">View & Pay</a></p><p>{{ orgName }}</p>", sort: 1 },
  { daysRelativeToDue: 7, subject: "Overdue: Invoice #{{ invoiceNumber }} (7 days past due)", body: "<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is now 7 days overdue.</p><p><a href=\"{{ paymentLink }}\">View & Pay</a></p><p>{{ orgName }}</p>", sort: 2 },
  { daysRelativeToDue: 14, subject: "Second notice: Invoice #{{ invoiceNumber }} (14 days overdue)", body: "<p>Hi {{ clientName }},</p><p>This is a second reminder that Invoice #{{ invoiceNumber }} for {{ amountDue }} is 14 days past due.</p><p><a href=\"{{ paymentLink }}\">View & Pay Now</a></p><p>{{ orgName }}</p>", sort: 3 },
  { daysRelativeToDue: 30, subject: "Final notice: Invoice #{{ invoiceNumber }} (30 days overdue)", body: "<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is now 30 days overdue. Please arrange payment immediately.</p><p><a href=\"{{ paymentLink }}\">View & Pay Now</a></p><p>{{ orgName }}</p>", sort: 4 },
];

type Props = {
  editId: string | null;
  onClose: () => void;
};

export function ReminderSequenceForm({ editId, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: existing } = trpc.reminderSequences.getById.useQuery(
    { id: editId! },
    { enabled: !!editId }
  );

  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [steps, setSteps] = useState<StepInput[]>(DEFAULT_STEPS);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setIsDefault(existing.isDefault);
      setEnabled(existing.enabled);
      setSteps(
        existing.steps.map((s) => ({
          daysRelativeToDue: s.daysRelativeToDue,
          subject: s.subject,
          body: s.body,
          sort: s.sort,
        }))
      );
    }
  }, [existing]);

  const createMutation = trpc.reminderSequences.create.useMutation({
    onSuccess: () => {
      toast.success("Sequence created");
      utils.reminderSequences.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.reminderSequences.update.useMutation({
    onSuccess: () => {
      toast.success("Sequence updated");
      utils.reminderSequences.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function addStep() {
    const maxDay = steps.length > 0 ? Math.max(...steps.map((s) => s.daysRelativeToDue)) : 0;
    setSteps([
      ...steps,
      {
        daysRelativeToDue: maxDay + 7,
        subject: "Reminder: Invoice #{{ invoiceNumber }}",
        body: "<p>Hi {{ clientName }},</p><p>This is a reminder about Invoice #{{ invoiceNumber }} for {{ amountDue }}.</p><p><a href=\"{{ paymentLink }}\">View & Pay</a></p><p>{{ orgName }}</p>",
        sort: steps.length,
      },
    ]);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, sort: i })));
  }

  function updateStep(index: number, field: keyof StepInput, value: string | number) {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (steps.length === 0) {
      toast.error("At least one step is required");
      return;
    }

    const data = { name: name.trim(), isDefault, enabled, steps };
    if (editId) {
      updateMutation.mutate({ id: editId, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border/50 bg-card p-5 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Sequence Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Default Reminder Sequence"
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-border" />
            Default sequence
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-border" />
            Enabled
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Steps</h3>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addStep}>
            <Plus className="w-3 h-3 mr-1" /> Add Step
          </Button>
        </div>
        {steps.map((step, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Step {i + 1}: {step.daysRelativeToDue < 0 ? `${Math.abs(step.daysRelativeToDue)} days before due` : step.daysRelativeToDue === 0 ? "On due date" : `${step.daysRelativeToDue} days after due`}
              </span>
              {steps.length > 1 && (
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeStep(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Days</label>
                <input
                  type="number"
                  value={step.daysRelativeToDue}
                  onChange={(e) => updateStep(i, "daysRelativeToDue", parseInt(e.target.value) || 0)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Subject</label>
                <input
                  type="text"
                  value={step.subject}
                  onChange={(e) => updateStep(i, "subject", e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Body (HTML)</label>
              <textarea
                value={step.body}
                onChange={(e) => updateStep(i, "body", e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isLoading}>
          {editId ? "Update Sequence" : "Create Sequence"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

```tsx
// src/components/settings/ReminderSequenceList.tsx
"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

type Props = { onEdit: (id: string) => void };

export function ReminderSequenceList({ onEdit }: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: sequences = [] } = trpc.reminderSequences.list.useQuery();

  const deleteMutation = trpc.reminderSequences.delete.useMutation({
    onSuccess: () => {
      toast.success("Sequence deleted");
      utils.reminderSequences.list.invalidate();
      setDeleteId(null);
    },
    onError: (err) => { toast.error(err.message); setDeleteId(null); },
  });

  if (sequences.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        No reminder sequences yet. Create one to automate payment reminders.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Steps</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoices</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {sequences.map((seq) => (
              <tr key={seq.id} className="hover:bg-accent/20 transition-colors">
                <td className="px-5 py-3.5 font-medium">
                  {seq.name}
                  {seq.isDefault && (
                    <span className="ml-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Default
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{seq.steps.length}</td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">
                  {seq.steps.map((s) => {
                    if (s.daysRelativeToDue < 0) return `${Math.abs(s.daysRelativeToDue)}d before`;
                    if (s.daysRelativeToDue === 0) return "due date";
                    return `+${s.daysRelativeToDue}d`;
                  }).join(", ")}
                </td>
                <td className="px-5 py-3.5">
                  {seq.enabled ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">Active</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Paused</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{seq._count.invoices}</td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(seq.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(seq.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete reminder sequence"
        description="Invoices using this sequence will fall back to the default. Existing reminder logs are preserved."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        loading={deleteMutation.isPending}
        destructive
      />
    </>
  );
}
```

## E2-Step 5: Add per-invoice reminder override and history on invoice detail

### Files
- **Modify:** `src/app/(dashboard)/invoices/[id]/page.tsx`
- **Create:** `src/components/invoices/ReminderOverrideSelect.tsx`
- **Create:** `src/components/invoices/ReminderHistory.tsx`

### Implementation

Add a reminder sequence selector and a history panel to the invoice detail page.

```tsx
// src/components/invoices/ReminderOverrideSelect.tsx
"use client";

import { trpc } from "@/trpc/client";
import { toast } from "sonner";

type Props = {
  invoiceId: string;
  currentSequenceId: string | null;
};

export function ReminderOverrideSelect({ invoiceId, currentSequenceId }: Props) {
  const utils = trpc.useUtils();
  const { data: sequences = [] } = trpc.reminderSequences.list.useQuery();

  const updateInvoice = trpc.invoices.update.useMutation({
    onSuccess: () => {
      toast.success("Reminder sequence updated");
      utils.invoices.get.invalidate({ id: invoiceId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        Reminder Sequence
      </label>
      <select
        value={currentSequenceId ?? ""}
        onChange={(e) => {
          const val = e.target.value || null;
          updateInvoice.mutate({
            id: invoiceId,
            reminderSequenceId: val,
          } as any);
        }}
        disabled={updateInvoice.isPending}
        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
      >
        <option value="">Use default</option>
        {sequences.map((seq) => (
          <option key={seq.id} value={seq.id}>
            {seq.name} {seq.isDefault ? "(default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
```

```tsx
// src/components/invoices/ReminderHistory.tsx
"use client";

import { trpc } from "@/trpc/client";

type Props = { invoiceId: string };

export function ReminderHistory({ invoiceId }: Props) {
  const { data: logs = [] } = trpc.reminderSequences.getInvoiceLogs.useQuery({ invoiceId });

  if (logs.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Reminder History</h2>
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sent</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sequence</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 text-muted-foreground">
                  {new Date(log.sentAt).toLocaleDateString("en-US", {
                    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{log.step.sequence.name}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {log.step.daysRelativeToDue < 0
                    ? `${Math.abs(log.step.daysRelativeToDue)}d before`
                    : log.step.daysRelativeToDue === 0
                    ? "Due date"
                    : `+${log.step.daysRelativeToDue}d after`}
                </td>
                <td className="px-5 py-3">{log.step.subject}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Then add these to the invoice detail page. In `src/app/(dashboard)/invoices/[id]/page.tsx`:

```tsx
// Add imports
import { ReminderOverrideSelect } from "@/components/invoices/ReminderOverrideSelect";
import { ReminderHistory } from "@/components/invoices/ReminderHistory";

// In the page header actions area (after the status badge, around line 120), add:
{invoice.type !== "CREDIT_NOTE" && (
  <ReminderOverrideSelect
    invoiceId={invoice.id}
    currentSequenceId={invoice.reminderSequenceId}
  />
)}

// Before the Comments section (around line 510), add:
{/* ── Reminder History ─────────────────────────────────────── */}
<ReminderHistory invoiceId={invoice.id} />
```

## E2-Step 6: Add settings page link and seed default sequence

Add a link to `/settings/reminders` on the main settings page. In `src/app/(dashboard)/settings/page.tsx`, add a card linking to the reminders settings alongside the existing automations link.

---

## Summary of All Files

### New Files (19)
| File | Feature |
|------|---------|
| `src/test/invoices-bulk-mutations.test.ts` | E1 |
| `src/test/bulk-action-bar.test.ts` | E1 |
| `src/components/invoices/InvoiceMobileListWithBulk.tsx` | E1 |
| `src/test/expenses-bulk-mutations.test.ts` | E1 |
| `prisma/migrations/<ts>_add_scheduled_reports/migration.sql` | E3 |
| `src/server/routers/scheduledReports.ts` | E3 |
| `src/test/scheduled-reports-validation.test.ts` | E3 |
| `src/server/services/report-pdf-generator.ts` | E3 |
| `src/inngest/functions/scheduled-reports.ts` | E3 |
| `src/app/(dashboard)/settings/reports/page.tsx` | E3 |
| `src/components/settings/ScheduledReportForm.tsx` | E3 |
| `src/components/settings/ScheduledReportList.tsx` | E3 |
| `prisma/migrations/<ts>_add_reminder_sequences/migration.sql` | E2 |
| `src/server/routers/reminderSequences.ts` | E2 |
| `src/test/reminder-sequences-validation.test.ts` | E2 |
| `src/inngest/functions/reminder-sequences.ts` | E2 |
| `src/app/(dashboard)/settings/reminders/page.tsx` | E2 |
| `src/components/settings/ReminderSequenceForm.tsx` | E2 |
| `src/components/settings/ReminderSequenceList.tsx` | E2 |
| `src/components/invoices/ReminderOverrideSelect.tsx` | E2 |
| `src/components/invoices/ReminderHistory.tsx` | E2 |

### Modified Files (10)
| File | Feature |
|------|---------|
| `src/server/routers/invoices.ts` | E1 (sendMany, markPaidMany) |
| `src/components/invoices/InvoiceTableWithBulk.tsx` | E1 (Send, Mark Paid buttons) |
| `src/app/(dashboard)/invoices/page.tsx` | E1 (mobile bulk) |
| `src/server/routers/expenses.ts` | E1 (deleteMany, categorizeMany) |
| `src/components/expenses/ExpenseList.tsx` | E1 (bulk selection) |
| `prisma/schema.prisma` | E3 + E2 (new models) |
| `src/server/routers/_app.ts` | E3 + E2 (register routers) |
| `src/app/api/inngest/route.ts` | E3 + E2 (register functions) |
| `src/app/(dashboard)/settings/page.tsx` | E3 + E2 (settings links) |
| `src/app/(dashboard)/invoices/[id]/page.tsx` | E2 (reminder override + history) |

# Tax Liability Report Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Tax Liability report page that shows tax collected grouped by tax type, with cash/accrual basis toggle, per-invoice detail, CSV export, and PDF export.

**Architecture:** New tRPC procedure queries `InvoiceLineTax` joined through `InvoiceLine` → `Invoice` → `Payment`. A new report page follows the existing report page pattern exactly. Two new API routes handle CSV and PDF exports. No schema changes needed.

**Tech Stack:** Next.js App Router (server components), tRPC, Prisma, @react-pdf/renderer, Tailwind CSS

---

### Task 1: Add `taxLiability` tRPC Procedure

**Files:**
- Modify: `src/server/routers/reports.ts`

**Step 1: Add the procedure to the reports router**

Add this procedure inside `reportsRouter` in `src/server/routers/reports.ts`, after the `timeTracking` procedure and before `expenseCategories`:

```typescript
taxLiability: protectedProcedure
  .input(
    dateRangeSchema.extend({
      basis: z.enum(["cash", "accrual"]).default("accrual"),
    })
  )
  .query(async ({ ctx, input }) => {
    const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });

    if (input.basis === "accrual") {
      // Accrual: filter by invoice date
      const lineTaxes = await ctx.db.invoiceLineTax.findMany({
        where: {
          invoiceLine: {
            invoice: {
              organizationId: org.id,
              isArchived: false,
              status: {
                notIn: [InvoiceStatus.DRAFT],
              },
              ...(input.from || input.to
                ? {
                    date: {
                      ...(input.from ? { gte: input.from } : {}),
                      ...(input.to ? { lte: input.to } : {}),
                    },
                  }
                : {}),
            },
          },
        },
        include: {
          tax: true,
          invoiceLine: {
            include: {
              invoice: {
                include: {
                  client: { select: { name: true } },
                  payments: { select: { amount: true, paidAt: true } },
                },
              },
            },
          },
        },
      });

      // Build summary grouped by tax
      const summaryMap = new Map<string, { taxName: string; taxRate: number; totalCollected: number; invoiceIds: Set<string> }>();
      const details: Array<{
        invoiceNumber: string;
        clientName: string;
        invoiceDate: Date;
        invoiceTotal: number;
        taxName: string;
        taxRate: number;
        taxAmount: number;
        paymentStatus: string;
        paymentDate: Date | null;
      }> = [];

      for (const lt of lineTaxes) {
        const inv = lt.invoiceLine.invoice;
        const taxKey = lt.taxId;
        const taxAmount = Number(lt.taxAmount);

        if (!summaryMap.has(taxKey)) {
          summaryMap.set(taxKey, {
            taxName: lt.tax.name,
            taxRate: Number(lt.tax.rate),
            totalCollected: 0,
            invoiceIds: new Set(),
          });
        }
        const entry = summaryMap.get(taxKey)!;
        entry.totalCollected += taxAmount;
        entry.invoiceIds.add(inv.id);

        const totalPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        const lastPayment = inv.payments.length > 0
          ? inv.payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0].paidAt
          : null;

        details.push({
          invoiceNumber: inv.number,
          clientName: inv.client.name,
          invoiceDate: inv.date,
          invoiceTotal: Number(inv.total),
          taxName: lt.tax.name,
          taxRate: Number(lt.tax.rate),
          taxAmount,
          paymentStatus: inv.status,
          paymentDate: lastPayment,
        });
      }

      const summary = Array.from(summaryMap.values()).map((s) => ({
        taxName: s.taxName,
        taxRate: s.taxRate,
        totalCollected: s.totalCollected,
        invoiceCount: s.invoiceIds.size,
      })).sort((a, b) => b.totalCollected - a.totalCollected);

      const grandTotal = summary.reduce((s, r) => s + r.totalCollected, 0);

      return { summary, details, grandTotal };
    }

    // Cash basis: filter by payment date, prorate tax
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
      include: {
        invoice: {
          include: {
            client: { select: { name: true } },
            lines: {
              include: {
                taxes: { include: { tax: true } },
              },
            },
          },
        },
      },
    });

    const summaryMap = new Map<string, { taxName: string; taxRate: number; totalCollected: number; invoiceIds: Set<string> }>();
    const details: Array<{
      invoiceNumber: string;
      clientName: string;
      invoiceDate: Date;
      invoiceTotal: number;
      taxName: string;
      taxRate: number;
      taxAmount: number;
      paymentStatus: string;
      paymentDate: Date | null;
    }> = [];

    for (const payment of payments) {
      const inv = payment.invoice;
      const invoiceTotal = Number(inv.total);
      if (invoiceTotal === 0) continue;

      const paymentRatio = Number(payment.amount) / invoiceTotal;

      for (const line of inv.lines) {
        for (const lt of line.taxes) {
          const proratedTax = Number(lt.taxAmount) * paymentRatio;
          const taxKey = lt.taxId;

          if (!summaryMap.has(taxKey)) {
            summaryMap.set(taxKey, {
              taxName: lt.tax.name,
              taxRate: Number(lt.tax.rate),
              totalCollected: 0,
              invoiceIds: new Set(),
            });
          }
          const entry = summaryMap.get(taxKey)!;
          entry.totalCollected += proratedTax;
          entry.invoiceIds.add(inv.id);

          details.push({
            invoiceNumber: inv.number,
            clientName: inv.client.name,
            invoiceDate: inv.date,
            invoiceTotal,
            taxName: lt.tax.name,
            taxRate: Number(lt.tax.rate),
            taxAmount: proratedTax,
            paymentStatus: inv.status,
            paymentDate: payment.paidAt,
          });
        }
      }
    }

    const summary = Array.from(summaryMap.values()).map((s) => ({
      taxName: s.taxName,
      taxRate: s.taxRate,
      totalCollected: s.totalCollected,
      invoiceCount: s.invoiceIds.size,
    })).sort((a, b) => b.totalCollected - a.totalCollected);

    const grandTotal = summary.reduce((s, r) => s + r.totalCollected, 0);

    return { summary, details, grandTotal };
  }),
```

**Step 2: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/server/routers/reports.ts
git commit -m "feat: add taxLiability tRPC procedure with cash/accrual basis"
```

---

### Task 2: Create Tax Liability Report Page

**Files:**
- Create: `src/app/(dashboard)/reports/tax-liability/page.tsx`
- Create: `src/app/(dashboard)/reports/tax-liability/loading.tsx`

**Step 1: Create the loading skeleton**

Create `src/app/(dashboard)/reports/tax-liability/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/50 bg-card p-4 h-20" />
        ))}
      </div>
      <div className="rounded-2xl border border-border/50 bg-card h-64" />
    </div>
  );
}
```

**Step 2: Create the report page**

Create `src/app/(dashboard)/reports/tax-liability/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { TaxBasisToggle } from "@/components/reports/TaxBasisToggle";

export default async function TaxLiabilityReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw = params.to ? new Date(params.to) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);
  const basis = params.basis === "cash" ? "cash" as const : "accrual" as const;

  const [data, org] = await Promise.all([
    api.reports.taxLiability({ from, to, basis }),
    api.organization.get(),
  ]);

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  const exportParams = (() => {
    const p = new URLSearchParams();
    if (params.from) p.set("from", params.from);
    if (params.to) p.set("to", params.to);
    p.set("basis", basis);
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  })();

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Tax Liability Report"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={`${dateRange} (${basis === "cash" ? "Cash Basis" : "Accrual Basis"})`}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 print:hidden"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Reports
          </Link>
          <span className="text-border/70 print:hidden">/</span>
          <h1 className="text-xl font-bold tracking-tight">Tax Liability</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/reports/tax-liability/export${exportParams}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors print:hidden"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
          <a
            href={`/api/reports/tax-liability/pdf${exportParams}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors print:hidden"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </a>
          <PrintReportButton />
        </div>
      </div>

      <ReportFilters basePath="/reports/tax-liability" from={params.from} to={params.to}>
        <TaxBasisToggle basis={basis} />
      </ReportFilters>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Tax Liability</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.grandTotal.toFixed(2)}</p>
        </div>
        {data.summary.slice(0, 3).map((s) => (
          <div key={s.taxName} className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium truncate">
              {s.taxName} ({s.taxRate}%)
            </p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">${s.totalCollected.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.invoiceCount} invoices</p>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Details</p>
          <p className="text-base font-semibold mt-0.5">Tax by Invoice</p>
        </div>

        {data.details.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No tax data for the selected period.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice Total</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax Amount</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.details.map((d, i) => (
                <tr key={i} className="hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-3.5 font-medium">{d.invoiceNumber}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{d.clientName}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">
                    {new Date(d.invoiceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-6 py-3.5 text-right tabular-nums">${d.invoiceTotal.toFixed(2)}</td>
                  <td className="px-6 py-3.5">{d.taxName}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums">{d.taxRate}%</td>
                  <td className="px-6 py-3.5 text-right font-semibold tabular-nums">${d.taxAmount.toFixed(2)}</td>
                  <td className="px-6 py-3.5 text-center">
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                      {d.paymentStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground">
                    {d.paymentDate
                      ? new Date(d.paymentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/20">
              <tr>
                <td colSpan={6} className="px-6 py-3 text-sm font-semibold text-right">Total Tax</td>
                <td className="px-6 py-3 text-right font-bold tabular-nums">${data.grandTotal.toFixed(2)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/reports/tax-liability/
git commit -m "feat: add tax liability report page with cash/accrual basis"
```

---

### Task 3: Create TaxBasisToggle Component

**Files:**
- Create: `src/components/reports/TaxBasisToggle.tsx`

**Step 1: Create the toggle component**

Create `src/components/reports/TaxBasisToggle.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Props = {
  basis: "cash" | "accrual";
};

export function TaxBasisToggle({ basis }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggle = useCallback(
    (newBasis: "cash" | "accrual") => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("basis", newBasis);
      router.replace(`/reports/tax-liability?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-card p-0.5">
      <button
        type="button"
        onClick={() => toggle("accrual")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          basis === "accrual"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Accrual
      </button>
      <button
        type="button"
        onClick={() => toggle("cash")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          basis === "cash"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Cash
      </button>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/reports/TaxBasisToggle.tsx
git commit -m "feat: add TaxBasisToggle component for tax liability report"
```

---

### Task 4: Add Tax Liability to Reports Index

**Files:**
- Modify: `src/app/(dashboard)/reports/page.tsx`

**Step 1: Add the report card**

In `src/app/(dashboard)/reports/page.tsx`, add `Scale` to the lucide-react import:

```typescript
import { FileText, CreditCard, Receipt, ChevronRight, TrendingUp, Clock, Timer, Download, Scale } from "lucide-react";
```

Then add this entry to the `reports` array, after the "Time Tracking" entry:

```typescript
{
  href: "/reports/tax-liability",
  label: "Tax Liability",
  description: "Tax collected by type for your accountant.",
  icon: <Scale className="w-4 h-4" />,
  color: "bg-orange-50 text-orange-600",
},
```

**Step 2: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/reports/page.tsx
git commit -m "feat: add tax liability card to reports index"
```

---

### Task 5: Create CSV Export Route

**Files:**
- Create: `src/app/api/reports/tax-liability/export/route.ts`

**Step 1: Create the CSV export route**

Create `src/app/api/reports/tax-liability/export/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { NextResponse } from "next/server";
import { InvoiceStatus } from "@/generated/prisma";

function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  // Prevent formula injection
  if (/^[=+\-@]/.test(str)) return `'${str}`;
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = user?.app_metadata?.organizationId as string | undefined;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const basis = searchParams.get("basis") === "cash" ? "cash" : "accrual";

  const fromRaw = fromParam ? new Date(fromParam) : undefined;
  const toRaw = toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const headers = [
    "Invoice Number",
    "Client",
    "Invoice Date",
    "Invoice Total",
    "Tax Name",
    "Tax Rate (%)",
    "Tax Amount",
    "Payment Status",
    "Payment Date",
    "Basis",
  ];

  let rows: string[];

  if (basis === "accrual") {
    const lineTaxes = await db.invoiceLineTax.findMany({
      where: {
        invoiceLine: {
          invoice: {
            organizationId: orgId,
            isArchived: false,
            status: { notIn: [InvoiceStatus.DRAFT] },
            ...(from || to
              ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
              : {}),
          },
        },
      },
      include: {
        tax: true,
        invoiceLine: {
          include: {
            invoice: {
              include: {
                client: { select: { name: true } },
                payments: { select: { amount: true, paidAt: true } },
              },
            },
          },
        },
      },
    });

    rows = lineTaxes.map((lt) => {
      const inv = lt.invoiceLine.invoice;
      const lastPayment = inv.payments.length > 0
        ? inv.payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0].paidAt
        : null;
      return [
        csvEscape(inv.number),
        csvEscape(inv.client.name),
        inv.date.toISOString().split("T")[0],
        Number(inv.total).toFixed(2),
        csvEscape(lt.tax.name),
        Number(lt.tax.rate).toFixed(4),
        Number(lt.taxAmount).toFixed(2),
        inv.status,
        lastPayment ? lastPayment.toISOString().split("T")[0] : "",
        "Accrual",
      ].join(",");
    });
  } else {
    const payments = await db.payment.findMany({
      where: {
        organizationId: orgId,
        ...(from || to
          ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: {
        invoice: {
          include: {
            client: { select: { name: true } },
            lines: { include: { taxes: { include: { tax: true } } } },
          },
        },
      },
    });

    rows = [];
    for (const payment of payments) {
      const inv = payment.invoice;
      const invoiceTotal = Number(inv.total);
      if (invoiceTotal === 0) continue;
      const paymentRatio = Number(payment.amount) / invoiceTotal;

      for (const line of inv.lines) {
        for (const lt of line.taxes) {
          const proratedTax = Number(lt.taxAmount) * paymentRatio;
          rows.push(
            [
              csvEscape(inv.number),
              csvEscape(inv.client.name),
              inv.date.toISOString().split("T")[0],
              invoiceTotal.toFixed(2),
              csvEscape(lt.tax.name),
              Number(lt.tax.rate).toFixed(4),
              proratedTax.toFixed(2),
              inv.status,
              payment.paidAt.toISOString().split("T")[0],
              "Cash",
            ].join(",")
          );
        }
      }
    }
  }

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tax-liability-${date}.csv"`,
    },
  });
}
```

**Step 2: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/reports/tax-liability/
git commit -m "feat: add tax liability CSV export route"
```

---

### Task 6: Create PDF Export Route

**Files:**
- Create: `src/app/api/reports/tax-liability/pdf/route.ts`

**Step 1: Create the PDF export route**

Create `src/app/api/reports/tax-liability/pdf/route.ts`. This uses `@react-pdf/renderer` following the existing `invoice-pdf.tsx` patterns:

```tsx
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { NextResponse } from "next/server";
import { InvoiceStatus } from "@/generated/prisma";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 48,
    color: "#1a1a1a",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#555",
    marginBottom: 16,
  },
  divider: {
    borderBottom: "1 solid #e5e7eb",
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottom: "0.5 solid #f0f0f0",
  },
  summaryLabel: {
    fontSize: 9,
  },
  summaryValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1 solid #d1d5db",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottom: "0.5 solid #f0f0f0",
  },
  colInvoice: { width: "12%" },
  colClient: { width: "16%" },
  colDate: { width: "10%" },
  colTotal: { width: "12%", textAlign: "right" as const },
  colTax: { width: "14%" },
  colRate: { width: "8%", textAlign: "right" as const },
  colAmount: { width: "12%", textAlign: "right" as const },
  colStatus: { width: "10%", textAlign: "center" as const },
  colPayDate: { width: "10%" },
  thText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase" as const,
    color: "#6b7280",
  },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1 solid #d1d5db",
  },
  grandTotalLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginRight: 16,
  },
  grandTotalValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    right: 48,
    fontSize: 7,
    color: "#999",
  },
});

type SummaryItem = { taxName: string; taxRate: number; totalCollected: number; invoiceCount: number };
type DetailItem = {
  invoiceNumber: string;
  clientName: string;
  invoiceDate: string;
  invoiceTotal: number;
  taxName: string;
  taxRate: number;
  taxAmount: number;
  paymentStatus: string;
  paymentDate: string;
};

function TaxLiabilityPdf({
  orgName,
  dateRange,
  basis,
  summary,
  details,
  grandTotal,
}: {
  orgName: string;
  dateRange: string;
  basis: string;
  summary: SummaryItem[];
  details: DetailItem[];
  grandTotal: number;
}) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{orgName}</Text>
          <Text style={styles.subtitle}>
            Tax Liability Report — {dateRange} ({basis === "cash" ? "Cash Basis" : "Accrual Basis"})
          </Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Summary by Tax Type</Text>
        {summary.map((s) => (
          <View key={s.taxName} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {s.taxName} ({s.taxRate}%) — {s.invoiceCount} invoices
            </Text>
            <Text style={styles.summaryValue}>${s.totalCollected.toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Invoice Details</Text>
        <View style={styles.tableHeader}>
          <View style={styles.colInvoice}><Text style={styles.thText}>Invoice</Text></View>
          <View style={styles.colClient}><Text style={styles.thText}>Client</Text></View>
          <View style={styles.colDate}><Text style={styles.thText}>Date</Text></View>
          <View style={styles.colTotal}><Text style={styles.thText}>Inv Total</Text></View>
          <View style={styles.colTax}><Text style={styles.thText}>Tax</Text></View>
          <View style={styles.colRate}><Text style={styles.thText}>Rate</Text></View>
          <View style={styles.colAmount}><Text style={styles.thText}>Tax Amt</Text></View>
          <View style={styles.colStatus}><Text style={styles.thText}>Status</Text></View>
          <View style={styles.colPayDate}><Text style={styles.thText}>Paid</Text></View>
        </View>
        {details.map((d, i) => (
          <View key={i} style={styles.tableRow}>
            <View style={styles.colInvoice}><Text>{d.invoiceNumber}</Text></View>
            <View style={styles.colClient}><Text>{d.clientName}</Text></View>
            <View style={styles.colDate}><Text>{d.invoiceDate}</Text></View>
            <View style={styles.colTotal}><Text>${d.invoiceTotal.toFixed(2)}</Text></View>
            <View style={styles.colTax}><Text>{d.taxName}</Text></View>
            <View style={styles.colRate}><Text>{d.taxRate}%</Text></View>
            <View style={styles.colAmount}><Text>${d.taxAmount.toFixed(2)}</Text></View>
            <View style={styles.colStatus}><Text>{d.paymentStatus.replace("_", " ")}</Text></View>
            <View style={styles.colPayDate}><Text>{d.paymentDate || "—"}</Text></View>
          </View>
        ))}

        <View style={styles.grandTotal}>
          <Text style={styles.grandTotalLabel}>Total Tax Liability:</Text>
          <Text style={styles.grandTotalValue}>${grandTotal.toFixed(2)}</Text>
        </View>

        <Text style={styles.footer}>
          Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </Text>
      </Page>
    </Document>
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = user?.app_metadata?.organizationId as string | undefined;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await db.organization.findFirst({ where: { id: orgId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const basis = searchParams.get("basis") === "cash" ? "cash" : "accrual";

  const fromRaw = fromParam ? new Date(fromParam) : undefined;
  const toRaw = toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  // Reuse same query logic as tRPC procedure
  let summary: SummaryItem[] = [];
  let details: DetailItem[] = [];
  let grandTotal = 0;

  if (basis === "accrual") {
    const lineTaxes = await db.invoiceLineTax.findMany({
      where: {
        invoiceLine: {
          invoice: {
            organizationId: orgId,
            isArchived: false,
            status: { notIn: [InvoiceStatus.DRAFT] },
            ...(from || to
              ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
              : {}),
          },
        },
      },
      include: {
        tax: true,
        invoiceLine: {
          include: {
            invoice: {
              include: {
                client: { select: { name: true } },
                payments: { select: { amount: true, paidAt: true } },
              },
            },
          },
        },
      },
    });

    const summaryMap = new Map<string, SummaryItem & { invoiceIds: Set<string> }>();
    for (const lt of lineTaxes) {
      const inv = lt.invoiceLine.invoice;
      const taxKey = lt.taxId;
      const taxAmount = Number(lt.taxAmount);

      if (!summaryMap.has(taxKey)) {
        summaryMap.set(taxKey, { taxName: lt.tax.name, taxRate: Number(lt.tax.rate), totalCollected: 0, invoiceCount: 0, invoiceIds: new Set() });
      }
      const entry = summaryMap.get(taxKey)!;
      entry.totalCollected += taxAmount;
      entry.invoiceIds.add(inv.id);

      const lastPayment = inv.payments.length > 0
        ? inv.payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0].paidAt
        : null;

      details.push({
        invoiceNumber: inv.number,
        clientName: inv.client.name,
        invoiceDate: inv.date.toISOString().split("T")[0],
        invoiceTotal: Number(inv.total),
        taxName: lt.tax.name,
        taxRate: Number(lt.tax.rate),
        taxAmount,
        paymentStatus: inv.status,
        paymentDate: lastPayment ? lastPayment.toISOString().split("T")[0] : "",
      });
    }
    summary = Array.from(summaryMap.values()).map((s) => ({
      taxName: s.taxName, taxRate: s.taxRate, totalCollected: s.totalCollected, invoiceCount: s.invoiceIds.size,
    })).sort((a, b) => b.totalCollected - a.totalCollected);
  } else {
    const payments = await db.payment.findMany({
      where: {
        organizationId: orgId,
        ...(from || to
          ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: {
        invoice: {
          include: {
            client: { select: { name: true } },
            lines: { include: { taxes: { include: { tax: true } } } },
          },
        },
      },
    });

    const summaryMap = new Map<string, SummaryItem & { invoiceIds: Set<string> }>();
    for (const payment of payments) {
      const inv = payment.invoice;
      const invoiceTotal = Number(inv.total);
      if (invoiceTotal === 0) continue;
      const paymentRatio = Number(payment.amount) / invoiceTotal;

      for (const line of inv.lines) {
        for (const lt of line.taxes) {
          const proratedTax = Number(lt.taxAmount) * paymentRatio;
          const taxKey = lt.taxId;

          if (!summaryMap.has(taxKey)) {
            summaryMap.set(taxKey, { taxName: lt.tax.name, taxRate: Number(lt.tax.rate), totalCollected: 0, invoiceCount: 0, invoiceIds: new Set() });
          }
          const entry = summaryMap.get(taxKey)!;
          entry.totalCollected += proratedTax;
          entry.invoiceIds.add(inv.id);

          details.push({
            invoiceNumber: inv.number,
            clientName: inv.client.name,
            invoiceDate: inv.date.toISOString().split("T")[0],
            invoiceTotal,
            taxName: lt.tax.name,
            taxRate: Number(lt.tax.rate),
            taxAmount: proratedTax,
            paymentStatus: inv.status,
            paymentDate: payment.paidAt.toISOString().split("T")[0],
          });
        }
      }
    }
    summary = Array.from(summaryMap.values()).map((s) => ({
      taxName: s.taxName, taxRate: s.taxRate, totalCollected: s.totalCollected, invoiceCount: s.invoiceIds.size,
    })).sort((a, b) => b.totalCollected - a.totalCollected);
  }

  grandTotal = summary.reduce((s, r) => s + r.totalCollected, 0);

  const buffer = await renderToBuffer(
    <TaxLiabilityPdf
      orgName={org.name}
      dateRange={dateRange}
      basis={basis}
      summary={summary}
      details={details}
      grandTotal={grandTotal}
    />
  );

  const date = new Date().toISOString().split("T")[0];
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tax-liability-${date}.pdf"`,
    },
  });
}
```

**Step 2: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/reports/tax-liability/pdf/
git commit -m "feat: add tax liability PDF export route"
```

---

### Task 7: Manual Smoke Test

**Step 1: Start dev server**

Run: `cd /Users/mlaplante/Sites/pancake && npx next dev`

**Step 2: Verify reports index**

Navigate to `http://localhost:3000/reports` and confirm the "Tax Liability" card appears with the orange scale icon.

**Step 3: Verify report page**

Click through to `/reports/tax-liability`. Verify:
- ReportHeader shows with org branding
- Date range filters work (try "This Year", "Last Year")
- Cash/Accrual toggle switches between modes
- Summary cards show tax types
- Detail table shows per-invoice breakdown
- Empty state shows correctly if no tax data

**Step 4: Verify CSV export**

Click "Export CSV" — file should download with correct data.

**Step 5: Verify PDF export**

Click "Export PDF" — file should download with letterhead, summary, and detail table.

**Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address smoke test issues in tax liability report"
```

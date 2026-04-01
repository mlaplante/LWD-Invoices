# Group A: Money Mechanics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add credit notes, deposits/retainers, late fees, and invoice-level discounts to the invoicing system.

**Architecture:** The app is a Next.js 16 App Router monolith using tRPC v11 routers for all mutations/queries, Prisma 7 with the PrismaPg adapter for PostgreSQL, and Inngest cron functions for background jobs. Invoice math flows through a centralized `tax-calculator.ts` service that computes line totals and invoice totals. PDFs are generated via `@react-pdf/renderer`. The `_app.ts` router aggregator wires all sub-routers into a single `appRouter`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, Supabase Auth, tRPC v11, Prisma 7, PostgreSQL, Inngest, @react-pdf/renderer, Vitest, Resend (email)

---

## Task Ordering

1. **A4: Invoice-Level Discounts** (simplest, no new models)
2. **A3: Late Fees / Interest** (medium, new model + Inngest cron)
3. **A2: Deposits / Retainers** (new models, client-scoped)
4. **A1: Credit Notes / Refunds** (most complex, builds on all of the above)

---

## A4: Invoice-Level Discounts

### Overview
Add `discountType` and `discountAmount` and `discountDescription` fields to the Invoice model. Discount is applied after line item subtotal, before tax. This changes the tax calculator, invoice form, detail page, and PDF.

### Step A4.1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

Add these fields to the `Invoice` model after the `simpleAmount` field (line ~305 in schema):

```prisma
model Invoice {
  // ... existing fields ...

  // Invoice-level discount (applied after subtotal, before tax)
  discountType        String?  // "percentage" | "fixed" | null
  discountAmount      Decimal  @default(0) @db.Decimal(20, 10)
  discountDescription String?

  // ... rest of existing fields ...
}
```

**Commands:**
```bash
npx prisma generate
npx prisma db push
```

**Commit:**
```bash
git add prisma/schema.prisma
git commit -m "feat(A4): add invoice-level discount fields to Invoice model"
```

### Step A4.2: Update Tax Calculator

**Files:**
- Modify: `src/server/services/tax-calculator.ts`
- Create: `src/test/invoice-discount.test.ts`

**Write failing test first** (`src/test/invoice-discount.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import {
  calculateInvoiceTotals,
  calculateInvoiceTotalsWithDiscount,
  type TaxInput,
  type LineInput,
} from "@/server/services/tax-calculator";

describe("calculateInvoiceTotalsWithDiscount", () => {
  const tax13: TaxInput = { id: "t1", rate: 13, isCompound: false };

  const lines: LineInput[] = [
    {
      qty: 2,
      rate: 100,
      lineType: "STANDARD" as any,
      discount: 0,
      discountIsPercentage: false,
      taxIds: ["t1"],
    },
  ];

  it("returns same totals as base when no discount applied", () => {
    const result = calculateInvoiceTotalsWithDiscount(lines, [tax13], null, 0);
    const base = calculateInvoiceTotals(lines, [tax13]);
    expect(result.subtotal).toBe(base.subtotal);
    expect(result.total).toBe(base.total);
    expect(result.invoiceDiscount).toBe(0);
  });

  it("applies fixed discount before tax", () => {
    // subtotal = 200, discount = 50, taxable = 150, tax = 19.50
    const result = calculateInvoiceTotalsWithDiscount(lines, [tax13], "fixed", 50);
    expect(result.subtotal).toBe(200);
    expect(result.invoiceDiscount).toBe(50);
    expect(result.taxTotal).toBe(19.5);
    expect(result.total).toBe(169.5); // 200 - 50 + 19.50
  });

  it("applies percentage discount before tax", () => {
    // subtotal = 200, discount = 10% = 20, taxable = 180, tax = 23.40
    const result = calculateInvoiceTotalsWithDiscount(lines, [tax13], "percentage", 10);
    expect(result.subtotal).toBe(200);
    expect(result.invoiceDiscount).toBe(20);
    expect(result.taxTotal).toBe(23.4);
    expect(result.total).toBe(203.4); // 200 - 20 + 23.40
  });

  it("caps fixed discount at subtotal (no negative totals)", () => {
    const result = calculateInvoiceTotalsWithDiscount(lines, [tax13], "fixed", 999);
    expect(result.invoiceDiscount).toBe(200); // capped at subtotal
    expect(result.total).toBe(0);
  });

  it("caps percentage discount at 100%", () => {
    const result = calculateInvoiceTotalsWithDiscount(lines, [tax13], "percentage", 150);
    expect(result.invoiceDiscount).toBe(200); // 100% of subtotal
    expect(result.total).toBe(0);
  });

  it("works with compound taxes and discount", () => {
    const compoundTax: TaxInput = { id: "t2", rate: 5, isCompound: true };
    const result = calculateInvoiceTotalsWithDiscount(
      lines,
      [tax13, compoundTax],
      "fixed",
      50
    );
    // subtotal = 200, discount = 50, taxable = 150
    // non-compound: 150 * 13% = 19.50
    // compound: (150 + 19.50) * 5% = 8.475
    // total = 150 + 19.50 + 8.475 = 177.975 -> 177.98
    expect(result.invoiceDiscount).toBe(50);
    expect(result.total).toBeCloseTo(177.98, 1);
  });

  it("stacks with line-item discounts", () => {
    const linesWithItemDiscount: LineInput[] = [
      {
        qty: 2,
        rate: 100,
        lineType: "STANDARD" as any,
        discount: 10, // $10 item-level discount
        discountIsPercentage: false,
        taxIds: ["t1"],
      },
    ];
    // Line subtotal after item discount: 200 - 10 = 190
    // Invoice discount: fixed $20
    // Taxable: 190 - 20 = 170
    // Tax: 170 * 13% = 22.10
    // Total: 170 + 22.10 = 192.10
    const result = calculateInvoiceTotalsWithDiscount(
      linesWithItemDiscount,
      [tax13],
      "fixed",
      20
    );
    expect(result.subtotal).toBe(190);
    expect(result.invoiceDiscount).toBe(20);
    expect(result.taxTotal).toBe(22.1);
    expect(result.total).toBe(192.1);
  });
});
```

**Run test (should fail):**
```bash
npx vitest run src/test/invoice-discount.test.ts
```

**Now implement** in `src/server/services/tax-calculator.ts`. Add this new export after the existing `calculateInvoiceTotals` function (after line 188):

```typescript
/**
 * Extended invoice totals that applies an invoice-level discount BEFORE recalculating tax.
 *
 * The discount reduces the taxable base proportionally across all lines.
 * This means tax is calculated on (subtotal - invoiceDiscount), not on the raw subtotal.
 *
 * @param discountType - "percentage" | "fixed" | null/undefined
 * @param discountAmount - The discount value (percentage points or fixed amount)
 */
export type InvoiceTotalsWithDiscount = InvoiceTotals & {
  invoiceDiscount: number;
};

export function calculateInvoiceTotalsWithDiscount(
  lines: LineInput[],
  allTaxes: TaxInput[],
  discountType: string | null | undefined,
  discountAmount: number,
): InvoiceTotalsWithDiscount {
  // First, calculate raw line subtotals (before invoice-level discount)
  let rawSubtotal = 0;
  const lineData: { line: LineInput; subtotal: number }[] = [];

  for (const line of lines) {
    if (
      line.lineType === ("PERCENTAGE_DISCOUNT" as LineType) ||
      line.lineType === ("FIXED_DISCOUNT" as LineType)
    ) {
      continue; // line-item discount lines handled separately
    }

    const lineTaxes = allTaxes.filter((t) => line.taxIds.includes(t.id));
    const result = calculateLineTotals(line, lineTaxes);
    rawSubtotal = round(rawSubtotal + result.subtotal);
    lineData.push({ line, subtotal: result.subtotal });
  }

  // Handle line-level discount lines (PERCENTAGE_DISCOUNT / FIXED_DISCOUNT)
  let lineDiscountTotal = 0;
  let runningForPctDiscount = rawSubtotal;
  for (const line of lines) {
    if (line.lineType === ("PERCENTAGE_DISCOUNT" as LineType)) {
      const discAmt = round(runningForPctDiscount * (line.rate / 100));
      lineDiscountTotal = round(lineDiscountTotal + discAmt);
      runningForPctDiscount = round(runningForPctDiscount - discAmt);
    } else if (line.lineType === ("FIXED_DISCOUNT" as LineType)) {
      const discAmt = round(line.rate);
      lineDiscountTotal = round(lineDiscountTotal + discAmt);
      runningForPctDiscount = round(runningForPctDiscount - discAmt);
    }
  }

  const subtotalAfterLineDiscounts = round(rawSubtotal - lineDiscountTotal);

  // Calculate invoice-level discount
  let invoiceDiscount = 0;
  if (discountType === "percentage" && discountAmount > 0) {
    const pct = Math.min(discountAmount, 100);
    invoiceDiscount = round2(round(subtotalAfterLineDiscounts * (pct / 100)));
  } else if (discountType === "fixed" && discountAmount > 0) {
    invoiceDiscount = round2(Math.min(discountAmount, subtotalAfterLineDiscounts));
  }

  const taxableBase = round(subtotalAfterLineDiscounts - invoiceDiscount);

  // Recalculate tax on the reduced taxable base
  // Prorate the discount across lines proportionally
  let taxTotal = 0;
  if (taxableBase > 0 && subtotalAfterLineDiscounts > 0) {
    const ratio = taxableBase / subtotalAfterLineDiscounts;
    for (const { line, subtotal } of lineData) {
      const adjustedSubtotal = round(subtotal * ratio);
      const lineTaxes = allTaxes.filter((t) => line.taxIds.includes(t.id));
      const nonCompound = lineTaxes.filter((t) => !t.isCompound);
      const compound = lineTaxes.filter((t) => t.isCompound);

      let lineTax = 0;
      for (const tax of nonCompound) {
        lineTax = round(lineTax + round(adjustedSubtotal * (tax.rate / 100)));
      }
      let running = round(adjustedSubtotal + lineTax);
      for (const tax of compound) {
        const amt = round(running * (tax.rate / 100));
        lineTax = round(lineTax + amt);
        running = round(running + amt);
      }
      taxTotal = round(taxTotal + lineTax);
    }
  }

  const total = round(taxableBase + taxTotal);

  return {
    subtotal: round2(subtotalAfterLineDiscounts),
    discountTotal: round2(lineDiscountTotal),
    invoiceDiscount: round2(invoiceDiscount),
    taxTotal: round2(taxTotal),
    total: round2(total),
  };
}
```

**Run test (should pass):**
```bash
npx vitest run src/test/invoice-discount.test.ts
```

**Commit:**
```bash
git add src/server/services/tax-calculator.ts src/test/invoice-discount.test.ts
git commit -m "feat(A4): add calculateInvoiceTotalsWithDiscount with full test coverage"
```

### Step A4.3: Update Invoice Router

**Files:**
- Modify: `src/server/routers/invoices.ts`

**Changes to `invoiceWriteSchema` (line ~36):** Add discount fields:

```typescript
const invoiceWriteSchema = z.object({
  type: z.nativeEnum(InvoiceType).default(InvoiceType.DETAILED),
  date: z.coerce.date().default(() => new Date()),
  dueDate: z.coerce.date().optional(),
  currencyId: z.string().min(1),
  exchangeRate: z.number().default(1),
  simpleAmount: z.number().optional(),
  notes: z.string().optional(),
  clientId: z.string().min(1),
  lines: z.array(lineSchema).default([]),
  reminderDaysOverride: z.array(z.number().int().min(1)).optional(),
  // Invoice-level discount
  discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
  discountAmount: z.number().min(0).default(0),
  discountDescription: z.string().max(200).optional(),
});
```

**Changes to `create` mutation (around line 230):** After calculating `invoiceTotals`, use the new discount function:

```typescript
// Replace the existing calculateInvoiceTotals call with:
import { calculateInvoiceTotalsWithDiscount } from "../services/tax-calculator";

// In create mutation:
const invoiceTotals = calculateInvoiceTotalsWithDiscount(
  input.lines.map(toLineInput),
  [...taxMap.values()],
  input.discountType ?? null,
  input.discountAmount ?? 0,
);

// In the invoice.create data, add:
discountType: input.discountType ?? null,
discountAmount: input.discountAmount ?? 0,
discountDescription: input.discountDescription,
// Update the totals fields:
subtotal: invoiceTotals.subtotal,
discountTotal: invoiceTotals.discountTotal + invoiceTotals.invoiceDiscount,
taxTotal: invoiceTotals.taxTotal,
total: invoiceTotals.total,
```

**Same changes to `update` mutation** (around line 339): Use `calculateInvoiceTotalsWithDiscount` and pass through the discount fields.

**Commit:**
```bash
git add src/server/routers/invoices.ts
git commit -m "feat(A4): wire invoice-level discount through create/update mutations"
```

### Step A4.4: Update Invoice Form UI

**Files:**
- Modify: `src/components/invoices/InvoiceForm.tsx`

Add to the `InvoiceFormData` type (around line 23):

```typescript
type InvoiceFormData = {
  // ... existing fields ...
  discountType: "percentage" | "fixed" | null;
  discountAmount: number;
  discountDescription: string;
};
```

Add default values in `useState` (around line 62):

```typescript
discountType: null,
discountAmount: 0,
discountDescription: "",
```

Add discount UI section between the line items section and the payment schedule section (between lines ~303 and ~306). Insert after the `</div>` closing the Line Items section:

```tsx
{/* Invoice-Level Discount */}
<div className="space-y-2">
  <h3 className="text-sm font-semibold">Invoice Discount</h3>
  <div className="flex items-end gap-3">
    <div className="space-y-1 w-40">
      <label className="text-xs text-muted-foreground">Type</label>
      <Select
        value={form.discountType ?? "none"}
        onValueChange={(v: string) =>
          setForm((f) => ({
            ...f,
            discountType: v === "none" ? null : (v as "percentage" | "fixed"),
            discountAmount: v === "none" ? 0 : f.discountAmount,
          }))
        }
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No discount</SelectItem>
          <SelectItem value="percentage">Percentage (%)</SelectItem>
          <SelectItem value="fixed">Fixed amount ({sym})</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {form.discountType && (
      <>
        <div className="space-y-1 w-32">
          <label className="text-xs text-muted-foreground">
            {form.discountType === "percentage" ? "Percentage" : "Amount"}
          </label>
          <Input
            type="number"
            min={0}
            max={form.discountType === "percentage" ? 100 : undefined}
            step={form.discountType === "percentage" ? 1 : 0.01}
            value={form.discountAmount || ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, discountAmount: parseFloat(e.target.value) || 0 }))
            }
          />
        </div>
        <div className="space-y-1 flex-1">
          <label className="text-xs text-muted-foreground">Description (optional)</label>
          <Input
            value={form.discountDescription}
            onChange={(e) =>
              setForm((f) => ({ ...f, discountDescription: e.target.value }))
            }
            placeholder="e.g. Early payment discount"
          />
        </div>
      </>
    )}
  </div>
</div>
```

Update the `invoiceTotals` calculation (around line 95) to use `calculateInvoiceTotalsWithDiscount`:

```typescript
import { calculateInvoiceTotalsWithDiscount } from "@/server/services/tax-calculator";

const invoiceTotals = calculateInvoiceTotalsWithDiscount(
  form.lines.map((l) => ({
    qty: l.qty,
    rate: l.rate,
    period: l.period,
    lineType: l.lineType,
    discount: l.discount,
    discountIsPercentage: l.discountIsPercentage,
    taxIds: l.taxIds,
  })),
  taxInputs,
  form.discountType,
  form.discountAmount,
);
```

Update the totals panel (around line 397) to show the invoice discount:

```tsx
{invoiceTotals.invoiceDiscount > 0 && (
  <div className="flex justify-between text-sm">
    <span className="text-muted-foreground">
      Discount{form.discountType === "percentage" ? ` (${form.discountAmount}%)` : ""}
    </span>
    <span className="text-emerald-600">-{fmt(invoiceTotals.invoiceDiscount)}</span>
  </div>
)}
```

Update the `buildInput()` function to include discount fields:

```typescript
function buildInput() {
  return {
    // ... existing fields ...
    discountType: form.discountType,
    discountAmount: form.discountAmount,
    discountDescription: form.discountDescription || undefined,
    // ... lines ...
  };
}
```

**Commit:**
```bash
git add src/components/invoices/InvoiceForm.tsx
git commit -m "feat(A4): add invoice-level discount UI to invoice form"
```

### Step A4.5: Update Invoice Detail Page

**Files:**
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx`

In the totals block (around line 307), add the invoice-level discount display after the line-item discount and before tax:

```tsx
{/* After the existing discountTotal display (line ~313) */}
{invoice.discountType && Number(invoice.discountAmount) > 0 && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">
      {invoice.discountDescription
        ? `Discount: ${invoice.discountDescription}`
        : invoice.discountType === "percentage"
        ? `Discount (${Number(invoice.discountAmount)}%)`
        : "Discount"}
    </span>
    <span className="font-medium text-emerald-600">
      -{f(
        invoice.discountType === "percentage"
          ? Number(invoice.subtotal) * Number(invoice.discountAmount) / 100
          : invoice.discountAmount
      )}
    </span>
  </div>
)}
```

Also update the edit page's `initialData` mapping (`src/app/(dashboard)/invoices/[id]/edit/page.tsx`, around line 27) to include discount fields:

```typescript
const initialData = {
  // ... existing fields ...
  discountType: invoice.discountType as "percentage" | "fixed" | null,
  discountAmount: Number(invoice.discountAmount),
  discountDescription: invoice.discountDescription ?? "",
};
```

**Commit:**
```bash
git add src/app/(dashboard)/invoices/[id]/page.tsx src/app/(dashboard)/invoices/[id]/edit/page.tsx
git commit -m "feat(A4): display invoice-level discount on detail and edit pages"
```

### Step A4.6: Update PDF Generation

**Files:**
- Modify: `src/server/services/invoice-pdf.tsx`

In the totals section of the PDF (around line 258), add after the existing discount display:

```tsx
{/* Invoice-level discount */}
{invoice.discountType && Number(invoice.discountAmount) > 0 && (
  <View style={styles.totalsRow}>
    <Text style={styles.totalsLabel}>
      {invoice.discountDescription
        ? `Discount: ${invoice.discountDescription}`
        : invoice.discountType === "percentage"
        ? `Discount (${Number(invoice.discountAmount)}%)`
        : "Discount"}
    </Text>
    <Text style={styles.totalsValue}>
      -{fmt(
        invoice.discountType === "percentage"
          ? Number(invoice.subtotal) * Number(invoice.discountAmount) / 100
          : invoice.discountAmount
      )}
    </Text>
  </View>
)}
```

**Commit:**
```bash
git add src/server/services/invoice-pdf.tsx
git commit -m "feat(A4): show invoice-level discount on PDF"
```

### Step A4.7: Update Reports (P&L)

**Files:**
- Modify: `src/server/routers/reports.ts`

No changes needed to the P&L report because it is based on `Payment` amounts, not invoice totals. The discount simply reduces the invoice total, which means less to collect. The existing P&L logic tracks actual payments received and expenses, so discounts are already accounted for implicitly.

However, if we want a "Discounts Given" metric, we can add it to the profitLoss report. In the `profitLoss` procedure (around line 191), after fetching payments and expenses, also fetch invoices with discounts:

```typescript
// Add to profitLoss query - fetch invoices with invoice-level discounts
const invoicesWithDiscounts = await ctx.db.invoice.findMany({
  where: {
    organizationId: ctx.orgId,
    discountType: { not: null },
    discountAmount: { gt: 0 },
    status: { notIn: ["DRAFT"] },
    ...(input.from || input.to
      ? { date: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
      : {}),
  },
  select: {
    discountType: true,
    discountAmount: true,
    subtotal: true,
    date: true,
  },
});

const totalDiscountsGiven = invoicesWithDiscounts.reduce((sum, inv) => {
  if (inv.discountType === "percentage") {
    return sum + Number(inv.subtotal) * Number(inv.discountAmount) / 100;
  }
  return sum + Number(inv.discountAmount);
}, 0);
```

Add `totalDiscountsGiven` to the return value.

**Commit:**
```bash
git add src/server/routers/reports.ts
git commit -m "feat(A4): add discounts given metric to P&L report"
```

---

## A3: Late Fees / Interest

### Overview
Add late fee configuration to Organization, a LateFeeEntry model to track applied fees, and an Inngest cron job that applies fees daily.

### Step A3.1: Schema Changes

**Files:**
- Modify: `prisma/schema.prisma`

Add to `Organization` model (after `emailBccOwner` field, line ~136):

```prisma
model Organization {
  // ... existing fields ...

  // Late fee settings
  lateFeeEnabled          Boolean @default(false)
  lateFeeType             String? // "percentage" | "flat"
  lateFeeAmount           Decimal @default(0) @db.Decimal(10, 4)
  lateFeeGraceDays        Int     @default(0)
  lateFeeRecurring        Boolean @default(false)
  lateFeeMaxApplications  Int?    // null = unlimited
  lateFeeIntervalDays     Int     @default(30) // days between recurring applications

  // ... existing relations ...
  lateFeeEntries          LateFeeEntry[]
}
```

Add new `LateFeeEntry` model (after `CreditNoteApplication` model, around line 726):

```prisma
model LateFeeEntry {
  id        String   @id @default(cuid())
  amount    Decimal  @db.Decimal(20, 10)
  feeType   String   // "percentage" | "flat" — snapshot at time of application
  feeRate   Decimal  @db.Decimal(10, 4) // snapshot of rate/amount at time of application
  isWaived  Boolean  @default(false)
  waivedAt  DateTime?
  waivedBy  String?  // userId who waived

  invoiceId      String
  invoice        Invoice      @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
}
```

Add relation to `Invoice` model (after `proposalContent` relation, line ~325):

```prisma
model Invoice {
  // ... existing relations ...
  lateFeeEntries          LateFeeEntry[]
}
```

**Commands:**
```bash
npx prisma generate
npx prisma db push
```

**Commit:**
```bash
git add prisma/schema.prisma
git commit -m "feat(A3): add late fee settings to Organization and LateFeeEntry model"
```

### Step A3.2: Late Fee Calculator Helper

**Files:**
- Create: `src/server/services/late-fees.ts`
- Create: `src/test/late-fees.test.ts`

**Write failing test first** (`src/test/late-fees.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import {
  calculateLateFee,
  shouldApplyLateFee,
  type LateFeeConfig,
  type InvoiceFeeContext,
} from "@/server/services/late-fees";

describe("calculateLateFee", () => {
  it("calculates flat fee", () => {
    expect(calculateLateFee("flat", 25, 1000)).toBe(25);
  });

  it("calculates percentage fee", () => {
    expect(calculateLateFee("percentage", 1.5, 1000)).toBe(15);
  });

  it("returns 0 for zero amount", () => {
    expect(calculateLateFee("flat", 0, 1000)).toBe(0);
  });

  it("returns 0 for zero invoice total", () => {
    expect(calculateLateFee("percentage", 5, 0)).toBe(0);
  });
});

describe("shouldApplyLateFee", () => {
  const baseConfig: LateFeeConfig = {
    enabled: true,
    type: "flat",
    amount: 25,
    graceDays: 3,
    recurring: false,
    maxApplications: null,
    intervalDays: 30,
  };

  const now = new Date("2026-03-31T12:00:00Z");

  it("returns false if late fees disabled", () => {
    const config = { ...baseConfig, enabled: false };
    const ctx: InvoiceFeeContext = {
      dueDate: new Date("2026-03-20"),
      existingFeeCount: 0,
      lastFeeDate: null,
    };
    expect(shouldApplyLateFee(config, ctx, now)).toBe(false);
  });

  it("returns false if within grace period", () => {
    const ctx: InvoiceFeeContext = {
      dueDate: new Date("2026-03-29"), // 2 days overdue, grace is 3
      existingFeeCount: 0,
      lastFeeDate: null,
    };
    expect(shouldApplyLateFee(baseConfig, ctx, now)).toBe(false);
  });

  it("returns true if past grace period with no existing fees", () => {
    const ctx: InvoiceFeeContext = {
      dueDate: new Date("2026-03-20"), // 11 days overdue, grace is 3
      existingFeeCount: 0,
      lastFeeDate: null,
    };
    expect(shouldApplyLateFee(baseConfig, ctx, now)).toBe(true);
  });

  it("returns false for non-recurring after first fee", () => {
    const ctx: InvoiceFeeContext = {
      dueDate: new Date("2026-03-01"),
      existingFeeCount: 1,
      lastFeeDate: new Date("2026-03-10"),
    };
    expect(shouldApplyLateFee(baseConfig, ctx, now)).toBe(false);
  });

  it("returns true for recurring if interval has passed", () => {
    const config = { ...baseConfig, recurring: true, intervalDays: 7 };
    const ctx: InvoiceFeeContext = {
      dueDate: new Date("2026-03-01"),
      existingFeeCount: 1,
      lastFeeDate: new Date("2026-03-20"), // 11 days ago
    };
    expect(shouldApplyLateFee(config, ctx, now)).toBe(true);
  });

  it("returns false for recurring if interval not reached", () => {
    const config = { ...baseConfig, recurring: true, intervalDays: 30 };
    const ctx: InvoiceFeeContext = {
      dueDate: new Date("2026-03-01"),
      existingFeeCount: 1,
      lastFeeDate: new Date("2026-03-20"), // only 11 days ago
    };
    expect(shouldApplyLateFee(config, ctx, now)).toBe(false);
  });

  it("returns false if maxApplications reached", () => {
    const config = { ...baseConfig, recurring: true, maxApplications: 3 };
    const ctx: InvoiceFeeContext = {
      dueDate: new Date("2026-03-01"),
      existingFeeCount: 3,
      lastFeeDate: new Date("2026-03-10"),
    };
    expect(shouldApplyLateFee(config, ctx, now)).toBe(false);
  });
});
```

**Run test (should fail):**
```bash
npx vitest run src/test/late-fees.test.ts
```

**Now implement** (`src/server/services/late-fees.ts`):

```typescript
export type LateFeeConfig = {
  enabled: boolean;
  type: string | null; // "percentage" | "flat"
  amount: number;
  graceDays: number;
  recurring: boolean;
  maxApplications: number | null;
  intervalDays: number;
};

export type InvoiceFeeContext = {
  dueDate: Date;
  existingFeeCount: number;
  lastFeeDate: Date | null;
};

/**
 * Calculate the late fee amount for an invoice.
 */
export function calculateLateFee(
  feeType: string,
  feeRate: number,
  invoiceTotal: number,
): number {
  if (feeRate === 0) return 0;
  if (feeType === "flat") return feeRate;
  if (feeType === "percentage") return Math.round(invoiceTotal * (feeRate / 100) * 100) / 100;
  return 0;
}

/**
 * Determine whether a late fee should be applied to an invoice today.
 */
export function shouldApplyLateFee(
  config: LateFeeConfig,
  ctx: InvoiceFeeContext,
  now: Date,
): boolean {
  if (!config.enabled) return false;

  const daysOverdue = Math.floor(
    (now.getTime() - ctx.dueDate.getTime()) / 86400000,
  );

  // Not yet past grace period
  if (daysOverdue <= config.graceDays) return false;

  // First fee - always apply
  if (ctx.existingFeeCount === 0) return true;

  // Non-recurring: only one fee ever
  if (!config.recurring) return false;

  // Max applications check
  if (config.maxApplications !== null && ctx.existingFeeCount >= config.maxApplications) {
    return false;
  }

  // Recurring interval check
  if (!ctx.lastFeeDate) return true;
  const daysSinceLastFee = Math.floor(
    (now.getTime() - ctx.lastFeeDate.getTime()) / 86400000,
  );
  return daysSinceLastFee >= config.intervalDays;
}
```

**Run test (should pass):**
```bash
npx vitest run src/test/late-fees.test.ts
```

**Commit:**
```bash
git add src/server/services/late-fees.ts src/test/late-fees.test.ts
git commit -m "feat(A3): add late fee calculator with full test coverage"
```

### Step A3.3: Inngest Cron Job

**Files:**
- Create: `src/inngest/functions/late-fees.ts`
- Modify: `src/app/api/inngest/route.ts`

**Implement** (`src/inngest/functions/late-fees.ts`):

```typescript
import { inngest } from "../client";
import { db } from "@/server/db";
import { notifyOrgAdmins } from "@/server/services/notifications";
import { calculateLateFee, shouldApplyLateFee, type LateFeeConfig, type InvoiceFeeContext } from "@/server/services/late-fees";

export const processLateFees = inngest.createFunction(
  { id: "process-late-fees", name: "Process Late Fees" },
  { cron: "30 7 * * *" }, // daily at 7:30am UTC (after overdue processing at 7am)
  async () => {
    const now = new Date();

    // Find all organizations with late fees enabled
    const orgs = await db.organization.findMany({
      where: { lateFeeEnabled: true },
      select: {
        id: true,
        lateFeeType: true,
        lateFeeAmount: true,
        lateFeeGraceDays: true,
        lateFeeRecurring: true,
        lateFeeMaxApplications: true,
        lateFeeIntervalDays: true,
      },
    });

    let totalApplied = 0;
    let totalSkipped = 0;

    for (const org of orgs) {
      const config: LateFeeConfig = {
        enabled: true,
        type: org.lateFeeType,
        amount: Number(org.lateFeeAmount),
        graceDays: org.lateFeeGraceDays,
        recurring: org.lateFeeRecurring,
        maxApplications: org.lateFeeMaxApplications,
        intervalDays: org.lateFeeIntervalDays,
      };

      // Find overdue invoices for this org
      const invoices = await db.invoice.findMany({
        where: {
          organizationId: org.id,
          status: "OVERDUE",
          isArchived: false,
          dueDate: { not: null },
          type: { in: ["SIMPLE", "DETAILED"] },
        },
        include: {
          lateFeeEntries: {
            where: { isWaived: false },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: {
            select: { lateFeeEntries: { where: { isWaived: false } } },
          },
        },
      });

      for (const invoice of invoices) {
        const feeContext: InvoiceFeeContext = {
          dueDate: invoice.dueDate!,
          existingFeeCount: invoice._count.lateFeeEntries,
          lastFeeDate: invoice.lateFeeEntries[0]?.createdAt ?? null,
        };

        if (!shouldApplyLateFee(config, feeContext, now)) {
          totalSkipped++;
          continue;
        }

        const feeAmount = calculateLateFee(
          config.type!,
          config.amount,
          Number(invoice.total),
        );

        if (feeAmount <= 0) {
          totalSkipped++;
          continue;
        }

        await db.lateFeeEntry.create({
          data: {
            amount: feeAmount,
            feeType: config.type!,
            feeRate: config.amount,
            invoiceId: invoice.id,
            organizationId: org.id,
          },
        });

        totalApplied++;

        // Notify org admins
        await notifyOrgAdmins(org.id, {
          type: "INVOICE_OVERDUE",
          title: `Late fee applied to #${invoice.number}`,
          body: `A ${config.type === "percentage" ? `${config.amount}%` : `$${config.amount}`} late fee was applied`,
          link: `/invoices/${invoice.id}`,
        }).catch(() => {});
      }
    }

    return { processed: totalApplied + totalSkipped, applied: totalApplied, skipped: totalSkipped };
  },
);
```

**Register in Inngest route** (`src/app/api/inngest/route.ts`). Add import and add to functions array:

```typescript
import { processLateFees } from "@/inngest/functions/late-fees";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processRecurringInvoices,
    processOverdueInvoices,
    processPaymentReminders,
    cleanupPendingUsers,
    processRecurringExpenses,
    processLateFees,
  ],
});
```

**Commit:**
```bash
git add src/inngest/functions/late-fees.ts src/app/api/inngest/route.ts
git commit -m "feat(A3): add Inngest cron job for daily late fee processing"
```

### Step A3.4: Late Fee tRPC Router

**Files:**
- Create: `src/server/routers/lateFees.ts`
- Modify: `src/server/routers/_app.ts`

**Implement** (`src/server/routers/lateFees.ts`):

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";

export const lateFeesRouter = router({
  /** List late fee entries for an invoice */
  listForInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.lateFeeEntry.findMany({
        where: {
          invoiceId: input.invoiceId,
          organizationId: ctx.orgId,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** Waive a late fee entry */
  waive: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.lateFeeEntry.findUnique({
        where: { id: input.id },
      });
      if (!entry || entry.organizationId !== ctx.orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (entry.isWaived) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already waived" });
      }
      return ctx.db.lateFeeEntry.update({
        where: { id: input.id },
        data: {
          isWaived: true,
          waivedAt: new Date(),
          waivedBy: ctx.userId,
        },
      });
    }),

  /** Manually apply a late fee to an invoice */
  applyManual: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        invoiceId: z.string(),
        amount: z.number().positive(),
        feeType: z.enum(["percentage", "flat"]),
        feeRate: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.lateFeeEntry.create({
        data: {
          amount: input.amount,
          feeType: input.feeType,
          feeRate: input.feeRate,
          invoiceId: input.invoiceId,
          organizationId: ctx.orgId,
        },
      });
    }),
});
```

**Register in `_app.ts`:** Add import and router entry:

```typescript
import { lateFeesRouter } from "./lateFees";

// In the appRouter:
lateFees: lateFeesRouter,
```

**Commit:**
```bash
git add src/server/routers/lateFees.ts src/server/routers/_app.ts
git commit -m "feat(A3): add lateFees tRPC router with list, waive, and manual apply"
```

### Step A3.5: Organization Settings UI for Late Fees

**Files:**
- Modify: `src/server/routers/organization.ts` (add late fee fields to get/update)
- Create: `src/components/settings/LateFeeSettingsForm.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx` (add "Policies" sub-page link)
- Create: `src/app/(dashboard)/settings/policies/page.tsx`

**Update organization router** (`src/server/routers/organization.ts`):

Add to the `get` select (line 9):

```typescript
lateFeeEnabled: true,
lateFeeType: true,
lateFeeAmount: true,
lateFeeGraceDays: true,
lateFeeRecurring: true,
lateFeeMaxApplications: true,
lateFeeIntervalDays: true,
```

Add to the `update` input schema (line 29):

```typescript
lateFeeEnabled: z.boolean().optional(),
lateFeeType: z.enum(["percentage", "flat"]).nullable().optional(),
lateFeeAmount: z.number().min(0).optional(),
lateFeeGraceDays: z.number().int().min(0).max(365).optional(),
lateFeeRecurring: z.boolean().optional(),
lateFeeMaxApplications: z.number().int().min(1).nullable().optional(),
lateFeeIntervalDays: z.number().int().min(1).max(365).optional(),
```

**Create LateFeeSettingsForm** (`src/components/settings/LateFeeSettingsForm.tsx`):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LateFeeOrg = {
  lateFeeEnabled: boolean;
  lateFeeType: string | null;
  lateFeeAmount: number;
  lateFeeGraceDays: number;
  lateFeeRecurring: boolean;
  lateFeeMaxApplications: number | null;
  lateFeeIntervalDays: number;
};

export function LateFeeSettingsForm({ org }: { org: LateFeeOrg }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState({
    lateFeeEnabled: org.lateFeeEnabled,
    lateFeeType: org.lateFeeType ?? "flat",
    lateFeeAmount: org.lateFeeAmount,
    lateFeeGraceDays: org.lateFeeGraceDays,
    lateFeeRecurring: org.lateFeeRecurring,
    lateFeeMaxApplications: org.lateFeeMaxApplications,
    lateFeeIntervalDays: org.lateFeeIntervalDays,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = trpc.organization.update.useMutation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    updateMutation.mutate(
      {
        lateFeeEnabled: form.lateFeeEnabled,
        lateFeeType: form.lateFeeEnabled ? (form.lateFeeType as "percentage" | "flat") : null,
        lateFeeAmount: form.lateFeeAmount,
        lateFeeGraceDays: form.lateFeeGraceDays,
        lateFeeRecurring: form.lateFeeRecurring,
        lateFeeMaxApplications: form.lateFeeRecurring ? form.lateFeeMaxApplications : null,
        lateFeeIntervalDays: form.lateFeeIntervalDays,
      },
      {
        onSuccess: () => {
          setSaved(true);
          startTransition(() => router.refresh());
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Saved successfully.
        </div>
      )}

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.lateFeeEnabled}
          onChange={(e) => setForm((p) => ({ ...p, lateFeeEnabled: e.target.checked }))}
          className="rounded"
        />
        <span className="font-medium">Enable automatic late fees</span>
      </label>

      {form.lateFeeEnabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Fee Type</label>
              <Select
                value={form.lateFeeType}
                onValueChange={(v) => setForm((p) => ({ ...p, lateFeeType: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat Amount</SelectItem>
                  <SelectItem value="percentage">Percentage of Total</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">
                {form.lateFeeType === "percentage" ? "Percentage (%)" : "Amount"}
              </label>
              <Input
                type="number"
                min={0}
                step={form.lateFeeType === "percentage" ? 0.01 : 1}
                value={form.lateFeeAmount}
                onChange={(e) =>
                  setForm((p) => ({ ...p, lateFeeAmount: parseFloat(e.target.value) || 0 }))
                }
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Grace Period (days)</label>
            <Input
              type="number"
              min={0}
              max={365}
              value={form.lateFeeGraceDays}
              onChange={(e) =>
                setForm((p) => ({ ...p, lateFeeGraceDays: parseInt(e.target.value) || 0 }))
              }
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Days after due date before the first late fee is applied.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.lateFeeRecurring}
              onChange={(e) => setForm((p) => ({ ...p, lateFeeRecurring: e.target.checked }))}
              className="rounded"
            />
            <span className="font-medium">Recurring late fees</span>
          </label>

          {form.lateFeeRecurring && (
            <div className="grid grid-cols-2 gap-4 pl-6">
              <div>
                <label className="text-sm font-medium">Apply every (days)</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={form.lateFeeIntervalDays}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      lateFeeIntervalDays: parseInt(e.target.value) || 30,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max applications</label>
                <Input
                  type="number"
                  min={1}
                  value={form.lateFeeMaxApplications ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      lateFeeMaxApplications: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    }))
                  }
                  placeholder="Unlimited"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave blank for unlimited.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
```

**Create policies settings page** (`src/app/(dashboard)/settings/policies/page.tsx`):

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LateFeeSettingsForm } from "@/components/settings/LateFeeSettingsForm";

export default async function PoliciesSettingsPage() {
  const org = await api.organization.get();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">Policies</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Late Fees
          </p>
          <p className="text-base font-semibold mt-1">Late Fee Settings</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automatically apply late fees to overdue invoices.
          </p>
        </div>
        <div className="px-6 py-6">
          <LateFeeSettingsForm
            org={{
              lateFeeEnabled: org.lateFeeEnabled,
              lateFeeType: org.lateFeeType,
              lateFeeAmount: Number(org.lateFeeAmount),
              lateFeeGraceDays: org.lateFeeGraceDays,
              lateFeeRecurring: org.lateFeeRecurring,
              lateFeeMaxApplications: org.lateFeeMaxApplications,
              lateFeeIntervalDays: org.lateFeeIntervalDays,
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

**Update settings page** (`src/app/(dashboard)/settings/page.tsx`): Add a "Policies" link to the `subPages` array (after "Expense Settings"):

```typescript
{
  href: "/settings/policies",
  label: "Policies",
  description: "Late fees, payment terms, and business rules.",
  icon: <Scale className="w-4 h-4" />, // import Scale from "lucide-react"
  color: "bg-red-50 text-red-600",
},
```

**Commit:**
```bash
git add src/server/routers/organization.ts src/components/settings/LateFeeSettingsForm.tsx src/app/(dashboard)/settings/policies/page.tsx src/app/(dashboard)/settings/page.tsx
git commit -m "feat(A3): add late fee settings UI in org policies page"
```

### Step A3.6: Invoice Detail - Late Fees Section

**Files:**
- Create: `src/components/invoices/LateFeeSection.tsx`
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx`

**Create LateFeeSection component** (`src/components/invoices/LateFeeSection.tsx`):

```tsx
"use client";

import { trpc } from "@/trpc/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  invoiceId: string;
  currencySymbol: string;
  currencySymbolPosition: string;
}

function fmt(n: number, symbol: string, pos: string): string {
  return pos === "before" ? `${symbol}${n.toFixed(2)}` : `${n.toFixed(2)}${symbol}`;
}

export function LateFeeSection({ invoiceId, currencySymbol, currencySymbolPosition }: Props) {
  const router = useRouter();
  const { data: fees, isLoading } = trpc.lateFees.listForInvoice.useQuery({ invoiceId });
  const waiveMutation = trpc.lateFees.waive.useMutation({
    onSuccess: () => {
      toast.success("Late fee waived");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !fees || fees.length === 0) return null;

  const f = (n: number) => fmt(n, currencySymbol, currencySymbolPosition);
  const activeFees = fees.filter((fee) => !fee.isWaived);
  const waivedFees = fees.filter((fee) => fee.isWaived);
  const totalActive = activeFees.reduce((sum, fee) => sum + Number(fee.amount), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Late Fees</h2>
        {totalActive > 0 && (
          <span className="text-sm font-medium text-red-600">
            Total: {f(totalActive)}
          </span>
        )}
      </div>
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              {["Date", "Type", "Amount", "Status", ""].map((h, i) => (
                <th
                  key={i}
                  className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {fees.map((fee) => (
              <tr key={fee.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3">
                  {new Date(fee.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-5 py-3 capitalize">
                  {fee.feeType === "percentage"
                    ? `${Number(fee.feeRate)}%`
                    : "Flat"}
                </td>
                <td className="px-5 py-3 font-medium">{f(Number(fee.amount))}</td>
                <td className="px-5 py-3">
                  {fee.isWaived ? (
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500">
                      Waived
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-600">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {!fee.isWaived && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => waiveMutation.mutate({ id: fee.id })}
                      disabled={waiveMutation.isPending}
                    >
                      Waive
                    </Button>
                  )}
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

**Add to invoice detail page** (`src/app/(dashboard)/invoices/[id]/page.tsx`): Import and add between Payment History and Comments sections (around line 390):

```tsx
import { LateFeeSection } from "@/components/invoices/LateFeeSection";

{/* After Payment Schedule section, before Comments */}
<LateFeeSection
  invoiceId={invoice.id}
  currencySymbol={sym}
  currencySymbolPosition={symPos}
/>
```

**Commit:**
```bash
git add src/components/invoices/LateFeeSection.tsx src/app/(dashboard)/invoices/[id]/page.tsx
git commit -m "feat(A3): display late fees on invoice detail with waive action"
```

### Step A3.7: Update PDF and Portal for Late Fees

**Files:**
- Modify: `src/server/services/invoice-pdf.tsx`

Add late fee entries to the `FullInvoice` type and include them in the PDF. After the Payment History section in the PDF template (around line 325), add:

```tsx
{/* Late Fees - these must be fetched and passed in the invoice include */}
```

Note: The PDF route (`src/app/api/invoices/[id]/pdf/route.ts`) will need to include `lateFeeEntries` in the Prisma query. Update the `FullInvoice` type to include `lateFeeEntries`:

```typescript
import type { ..., LateFeeEntry } from "@/generated/prisma";

export type FullInvoice = Invoice & {
  // ... existing ...
  lateFeeEntries?: LateFeeEntry[];
};
```

Add to PDF after Payment History:

```tsx
{invoice.lateFeeEntries && invoice.lateFeeEntries.filter(f => !f.isWaived).length > 0 && (
  <View style={{ marginTop: 24 }}>
    <Text style={[styles.label, { marginBottom: 6 }]}>Late Fees</Text>
    {invoice.lateFeeEntries
      .filter((f) => !f.isWaived)
      .map((fee) => (
        <View key={fee.id} style={[styles.totalsRow, { minWidth: "auto", justifyContent: "space-between" }]}>
          <Text style={{ color: "#6b7280" }}>
            {formatDate(fee.createdAt)} · {fee.feeType === "percentage" ? `${Number(fee.feeRate)}%` : "Flat fee"}
          </Text>
          <Text>{fmt(fee.amount)}</Text>
        </View>
      ))}
  </View>
)}
```

Update the PDF route to include `lateFeeEntries`:

```typescript
// In src/app/api/invoices/[id]/pdf/route.ts, add to the include:
lateFeeEntries: { where: { isWaived: false }, orderBy: { createdAt: "asc" } },
```

**Commit:**
```bash
git add src/server/services/invoice-pdf.tsx src/app/api/invoices/[id]/pdf/route.ts
git commit -m "feat(A3): show late fees on invoice PDF"
```

---

## A2: Deposits / Retainers

### Overview
Add `Retainer` and `RetainerTransaction` models. Clients can deposit funds which are then drawn down when invoices are created.

### Step A2.1: Schema Changes

**Files:**
- Modify: `prisma/schema.prisma`

Add new models after `CreditNoteApplication` (around line 726):

```prisma
model Retainer {
  id             String  @id @default(cuid())
  balance        Decimal @default(0) @db.Decimal(20, 10)

  clientId       String  @unique
  client         Client  @relation(fields: [clientId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  transactions RetainerTransaction[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([clientId, organizationId])
}

model RetainerTransaction {
  id          String   @id @default(cuid())
  type        String   // "deposit" | "drawdown" | "refund"
  amount      Decimal  @db.Decimal(20, 10)
  description String?
  method      String?  // payment method for deposits

  retainerId String
  retainer   Retainer @relation(fields: [retainerId], references: [id], onDelete: Cascade)
  invoiceId  String?  // linked invoice for drawdowns
  invoice    Invoice? @relation(fields: [invoiceId], references: [id])

  createdAt DateTime @default(now())
}
```

Add relation to `Client`:

```prisma
model Client {
  // ... existing relations ...
  retainer       Retainer?
}
```

Add relation to `Invoice`:

```prisma
model Invoice {
  // ... existing relations ...
  retainerApplied         Decimal  @default(0) @db.Decimal(20, 10)
  retainerTransactions    RetainerTransaction[]
}
```

Add relation to `Organization`:

```prisma
model Organization {
  // ... existing relations ...
  retainers               Retainer[]
}
```

**Commands:**
```bash
npx prisma generate
npx prisma db push
```

**Commit:**
```bash
git add prisma/schema.prisma
git commit -m "feat(A2): add Retainer and RetainerTransaction models"
```

### Step A2.2: Retainer Service Helper

**Files:**
- Create: `src/server/services/retainers.ts`
- Create: `src/test/retainers.test.ts`

**Write failing test** (`src/test/retainers.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import {
  calculateDrawdownAmount,
  validateDeposit,
  validateDrawdown,
} from "@/server/services/retainers";

describe("calculateDrawdownAmount", () => {
  it("returns invoice total when retainer covers it fully", () => {
    expect(calculateDrawdownAmount(500, 1000)).toBe(500);
  });

  it("returns retainer balance when invoice exceeds balance", () => {
    expect(calculateDrawdownAmount(1000, 300)).toBe(300);
  });

  it("returns 0 when balance is 0", () => {
    expect(calculateDrawdownAmount(500, 0)).toBe(0);
  });

  it("returns 0 when invoice total is 0", () => {
    expect(calculateDrawdownAmount(0, 500)).toBe(0);
  });
});

describe("validateDeposit", () => {
  it("accepts positive amount", () => {
    expect(() => validateDeposit(100)).not.toThrow();
  });

  it("rejects zero amount", () => {
    expect(() => validateDeposit(0)).toThrow("positive");
  });

  it("rejects negative amount", () => {
    expect(() => validateDeposit(-50)).toThrow("positive");
  });
});

describe("validateDrawdown", () => {
  it("accepts amount within balance", () => {
    expect(() => validateDrawdown(50, 100)).not.toThrow();
  });

  it("accepts amount equal to balance", () => {
    expect(() => validateDrawdown(100, 100)).not.toThrow();
  });

  it("rejects amount exceeding balance", () => {
    expect(() => validateDrawdown(150, 100)).toThrow("exceeds");
  });

  it("rejects zero amount", () => {
    expect(() => validateDrawdown(0, 100)).toThrow("positive");
  });
});
```

**Run test (should fail):**
```bash
npx vitest run src/test/retainers.test.ts
```

**Implement** (`src/server/services/retainers.ts`):

```typescript
/**
 * Calculate how much of a retainer can be applied to an invoice.
 */
export function calculateDrawdownAmount(
  invoiceTotal: number,
  retainerBalance: number,
): number {
  if (invoiceTotal <= 0 || retainerBalance <= 0) return 0;
  return Math.min(invoiceTotal, retainerBalance);
}

/**
 * Validate a deposit amount.
 */
export function validateDeposit(amount: number): void {
  if (amount <= 0) {
    throw new Error("Deposit amount must be positive");
  }
}

/**
 * Validate a drawdown amount against the retainer balance.
 */
export function validateDrawdown(amount: number, balance: number): void {
  if (amount <= 0) {
    throw new Error("Drawdown amount must be positive");
  }
  if (amount > balance) {
    throw new Error(`Drawdown amount exceeds retainer balance of ${balance}`);
  }
}
```

**Run test (should pass):**
```bash
npx vitest run src/test/retainers.test.ts
```

**Commit:**
```bash
git add src/server/services/retainers.ts src/test/retainers.test.ts
git commit -m "feat(A2): add retainer helper functions with tests"
```

### Step A2.3: Retainers tRPC Router

**Files:**
- Create: `src/server/routers/retainers.ts`
- Modify: `src/server/routers/_app.ts`

**Implement** (`src/server/routers/retainers.ts`):

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { validateDeposit, validateDrawdown } from "../services/retainers";
import { InvoiceStatus } from "@/generated/prisma";

export const retainersRouter = router({
  /** Get retainer for a client (creates if not exists) */
  getForClient: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      let retainer = await ctx.db.retainer.findFirst({
        where: { clientId: input.clientId, organizationId: ctx.orgId },
        include: {
          transactions: { orderBy: { createdAt: "desc" }, take: 50 },
        },
      });

      if (!retainer) {
        retainer = await ctx.db.retainer.create({
          data: {
            clientId: input.clientId,
            organizationId: ctx.orgId,
            balance: 0,
          },
          include: {
            transactions: { orderBy: { createdAt: "desc" }, take: 50 },
          },
        });
      }

      return retainer;
    }),

  /** Record a deposit */
  deposit: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        clientId: z.string(),
        amount: z.number().positive(),
        description: z.string().optional(),
        method: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        validateDeposit(input.amount);
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }

      return ctx.db.$transaction(async (tx) => {
        // Get or create retainer
        let retainer = await tx.retainer.findFirst({
          where: { clientId: input.clientId, organizationId: ctx.orgId },
        });

        if (!retainer) {
          retainer = await tx.retainer.create({
            data: {
              clientId: input.clientId,
              organizationId: ctx.orgId,
              balance: 0,
            },
          });
        }

        // Create transaction
        await tx.retainerTransaction.create({
          data: {
            type: "deposit",
            amount: input.amount,
            description: input.description,
            method: input.method,
            retainerId: retainer.id,
          },
        });

        // Update balance
        return tx.retainer.update({
          where: { id: retainer.id },
          data: { balance: { increment: input.amount } },
          include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } },
        });
      });
    }),

  /** Apply retainer to an invoice (drawdown) */
  applyToInvoice: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        clientId: z.string(),
        invoiceId: z.string(),
        amount: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(
        async (tx) => {
          const retainer = await tx.retainer.findFirst({
            where: { clientId: input.clientId, organizationId: ctx.orgId },
          });
          if (!retainer) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No retainer found for this client" });
          }

          const invoice = await tx.invoice.findUnique({
            where: { id: input.invoiceId, organizationId: ctx.orgId },
            select: { total: true, retainerApplied: true, status: true },
          });
          if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

          try {
            validateDrawdown(input.amount, Number(retainer.balance));
          } catch (e) {
            throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
          }

          const remainingBalance = Number(invoice.total) - Number(invoice.retainerApplied);
          if (input.amount > remainingBalance) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Amount exceeds invoice remaining balance of ${remainingBalance}`,
            });
          }

          // Create drawdown transaction
          await tx.retainerTransaction.create({
            data: {
              type: "drawdown",
              amount: input.amount,
              description: `Applied to invoice`,
              retainerId: retainer.id,
              invoiceId: input.invoiceId,
            },
          });

          // Decrease retainer balance
          await tx.retainer.update({
            where: { id: retainer.id },
            data: { balance: { decrement: input.amount } },
          });

          // Update invoice retainerApplied
          const newRetainerApplied = Number(invoice.retainerApplied) + input.amount;
          const newStatus =
            newRetainerApplied >= Number(invoice.total)
              ? InvoiceStatus.PAID
              : invoice.status;

          return tx.invoice.update({
            where: { id: input.invoiceId },
            data: {
              retainerApplied: newRetainerApplied,
              status: newStatus,
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    }),
});
```

**Register in `_app.ts`:**

```typescript
import { retainersRouter } from "./retainers";

// In appRouter:
retainers: retainersRouter,
```

**Commit:**
```bash
git add src/server/routers/retainers.ts src/server/routers/_app.ts
git commit -m "feat(A2): add retainers tRPC router with deposit and drawdown"
```

### Step A2.4: Client Retainer UI

**Files:**
- Create: `src/components/clients/RetainerPanel.tsx`
- Modify: Client detail page (to include RetainerPanel)

**Create RetainerPanel** (`src/components/clients/RetainerPanel.tsx`):

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  clientId: string;
  currencySymbol: string;
  currencySymbolPosition: string;
}

function fmt(n: number, symbol: string, pos: string): string {
  return pos === "before" ? `${symbol}${n.toFixed(2)}` : `${n.toFixed(2)}${symbol}`;
}

export function RetainerPanel({ clientId, currencySymbol, currencySymbolPosition }: Props) {
  const router = useRouter();
  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("");

  const f = (n: number) => fmt(n, currencySymbol, currencySymbolPosition);

  const { data: retainer, isLoading } = trpc.retainers.getForClient.useQuery({ clientId });
  const utils = trpc.useUtils();

  const depositMutation = trpc.retainers.deposit.useMutation({
    onSuccess: () => {
      toast.success("Deposit recorded");
      void utils.retainers.getForClient.invalidate({ clientId });
      setDepositOpen(false);
      setAmount("");
      setDescription("");
      setMethod("");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return null;

  const balance = Number(retainer?.balance ?? 0);
  const transactions = retainer?.transactions ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Retainer</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            Balance: <span className={balance > 0 ? "text-emerald-600" : ""}>{f(balance)}</span>
          </span>
          <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Record Deposit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Retainer Deposit</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Monthly retainer deposit"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Payment Method (optional)</Label>
                  <Input
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    placeholder="e.g. Stripe, bank transfer"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!amount || depositMutation.isPending}
                  onClick={() =>
                    depositMutation.mutate({
                      clientId,
                      amount: Number(amount),
                      description: description || undefined,
                      method: method || undefined,
                    })
                  }
                >
                  {depositMutation.isPending ? "Recording..." : "Record Deposit"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {transactions.length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                {["Date", "Type", "Description", "Amount"].map((h, i) => (
                  <th
                    key={i}
                    className={`px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${
                      i === 3 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    {new Date(tx.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 capitalize">{tx.type}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {tx.description ?? "-"}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">
                    <span className={tx.type === "deposit" ? "text-emerald-600" : "text-red-600"}>
                      {tx.type === "deposit" ? "+" : "-"}{f(Number(tx.amount))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/clients/RetainerPanel.tsx
git commit -m "feat(A2): add RetainerPanel component with deposit recording and history"
```

### Step A2.5: Apply Retainer on Invoice Detail

**Files:**
- Create: `src/components/invoices/ApplyRetainerDialog.tsx`
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx`

**Create ApplyRetainerDialog** (`src/components/invoices/ApplyRetainerDialog.tsx`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";

interface Props {
  invoiceId: string;
  clientId: string;
  invoiceTotal: number;
  retainerApplied: number;
}

export function ApplyRetainerDialog({
  invoiceId,
  clientId,
  invoiceTotal,
  retainerApplied,
}: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const router = useRouter();

  const { data: retainer } = trpc.retainers.getForClient.useQuery(
    { clientId },
    { enabled: open },
  );
  const utils = trpc.useUtils();

  const applyMutation = trpc.retainers.applyToInvoice.useMutation({
    onSuccess: () => {
      toast.success("Retainer applied");
      void utils.invoices.get.invalidate({ id: invoiceId });
      void utils.retainers.getForClient.invalidate({ clientId });
      router.refresh();
      setOpen(false);
      setAmount("");
    },
    onError: (err) => toast.error(err.message),
  });

  const balance = Number(retainer?.balance ?? 0);
  const remaining = invoiceTotal - retainerApplied;
  const maxApplicable = Math.min(balance, remaining);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Apply Retainer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Retainer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm space-y-1">
            <p>
              Retainer balance: <span className="font-medium">${balance.toFixed(2)}</span>
            </p>
            <p>
              Invoice remaining: <span className="font-medium">${remaining.toFixed(2)}</span>
            </p>
            <p>
              Max applicable: <span className="font-medium">${maxApplicable.toFixed(2)}</span>
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Amount to Apply</Label>
            <Input
              type="number"
              min="0.01"
              max={maxApplicable}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={!amount || Number(amount) <= 0 || applyMutation.isPending}
            onClick={() =>
              applyMutation.mutate({
                clientId,
                invoiceId,
                amount: Number(amount),
              })
            }
          >
            {applyMutation.isPending ? "Applying..." : "Apply"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Add to invoice detail page** (`src/app/(dashboard)/invoices/[id]/page.tsx`): Add "Apply Retainer" button in the actions section (around line 154, near the ApplyCreditNoteDialog):

```tsx
import { ApplyRetainerDialog } from "@/components/invoices/ApplyRetainerDialog";

{/* Add after the ApplyCreditNoteDialog */}
{isPayable && invoice.type !== "CREDIT_NOTE" && (
  <ApplyRetainerDialog
    invoiceId={invoice.id}
    clientId={invoice.client.id}
    invoiceTotal={Number(invoice.total)}
    retainerApplied={Number(invoice.retainerApplied)}
  />
)}
```

Also show retainer applied in the totals block (around line 327):

```tsx
{Number(invoice.retainerApplied) > 0 && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Retainer Applied</span>
    <span className="font-medium text-emerald-600">
      -{f(invoice.retainerApplied)}
    </span>
  </div>
)}
```

**Commit:**
```bash
git add src/components/invoices/ApplyRetainerDialog.tsx src/app/(dashboard)/invoices/[id]/page.tsx
git commit -m "feat(A2): add Apply Retainer dialog on invoice detail page"
```

### Step A2.6: Update Reports for Retainers

**Files:**
- Modify: `src/server/routers/reports.ts`

Add a `retainerLiability` report to track unearned revenue:

```typescript
retainerLiability: protectedProcedure.query(async ({ ctx }) => {
  const retainers = await ctx.db.retainer.findMany({
    where: { organizationId: ctx.orgId },
    include: {
      client: { select: { id: true, name: true } },
    },
  });

  return retainers
    .filter((r) => Number(r.balance) > 0)
    .map((r) => ({
      clientId: r.client.id,
      clientName: r.client.name,
      balance: Number(r.balance),
    }))
    .sort((a, b) => b.balance - a.balance);
}),
```

**Commit:**
```bash
git add src/server/routers/reports.ts
git commit -m "feat(A2): add retainer liability report"
```

---

## A1: Credit Notes / Refunds (Enhanced)

### Overview
The existing codebase already has a basic credit note system using the `CREDIT_NOTE` InvoiceType and `CreditNoteApplication` join table. This task enhances it with:
- Sequential CN-prefixed numbering (CN-0001)
- Status lifecycle (draft -> issued -> applied -> voided)
- "Issue Credit Note" from invoice detail page (pre-populates from source invoice)
- Partial credit support (select specific line items)
- PDF generation for credit notes
- P&L impact (negative revenue)
- Optional Stripe refund trigger

### Step A1.1: Schema Enhancements

**Files:**
- Modify: `prisma/schema.prisma`

Add to `Organization` model:

```prisma
model Organization {
  // ... existing fields ...
  creditNotePrefix     String  @default("CN")
  creditNoteNextNumber Int     @default(1)
}
```

Add to `Invoice` model (for credit notes specifically):

```prisma
model Invoice {
  // ... existing fields ...
  sourceInvoiceId     String?  // The invoice this credit note was issued against
}
```

Add a `CreditNoteStatus` enum:

```prisma
enum CreditNoteStatus {
  DRAFT
  ISSUED
  APPLIED
  VOIDED
}
```

Add status field to distinguish credit note lifecycle (we reuse the Invoice model but track CN status separately):

```prisma
model Invoice {
  // ... existing fields ...
  creditNoteStatus    CreditNoteStatus?  // Only set when type = CREDIT_NOTE
}
```

**Commands:**
```bash
npx prisma generate
npx prisma db push
```

**Commit:**
```bash
git add prisma/schema.prisma
git commit -m "feat(A1): add credit note sequential numbering and status fields"
```

### Step A1.2: Credit Note Number Generator

**Files:**
- Create: `src/server/services/credit-note-numbering.ts`
- Create: `src/test/credit-note-numbering.test.ts`

**Write failing test** (`src/test/credit-note-numbering.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { formatCreditNoteNumber } from "@/server/services/credit-note-numbering";

describe("formatCreditNoteNumber", () => {
  it("formats with default prefix", () => {
    expect(formatCreditNoteNumber("CN", 1)).toBe("CN-2026-0001");
  });

  it("pads to 4 digits", () => {
    expect(formatCreditNoteNumber("CN", 42)).toBe("CN-2026-0042");
  });

  it("handles custom prefix", () => {
    expect(formatCreditNoteNumber("CR", 100)).toBe("CR-2026-0100");
  });

  it("handles 5+ digit numbers", () => {
    expect(formatCreditNoteNumber("CN", 12345)).toBe("CN-2026-12345");
  });
});
```

**Run test (should fail):**
```bash
npx vitest run src/test/credit-note-numbering.test.ts
```

**Implement** (`src/server/services/credit-note-numbering.ts`):

```typescript
import { PrismaClient } from "@/generated/prisma";

/**
 * Format a credit note number string.
 */
export function formatCreditNoteNumber(prefix: string, seq: number): string {
  const year = new Date().getFullYear();
  const padded = String(seq).padStart(4, "0");
  return `${prefix}-${year}-${padded}`;
}

/**
 * Atomically generate the next credit note number for an organization.
 * Must be called inside a transaction.
 */
export async function generateCreditNoteNumber(
  db: PrismaClient,
  orgId: string,
): Promise<string> {
  const org = await db.organization.update({
    where: { id: orgId },
    data: { creditNoteNextNumber: { increment: 1 } },
    select: { creditNotePrefix: true, creditNoteNextNumber: true },
  });

  return formatCreditNoteNumber(org.creditNotePrefix, org.creditNoteNextNumber);
}
```

**Run test (should pass):**
```bash
npx vitest run src/test/credit-note-numbering.test.ts
```

**Commit:**
```bash
git add src/server/services/credit-note-numbering.ts src/test/credit-note-numbering.test.ts
git commit -m "feat(A1): add credit note number generator with tests"
```

### Step A1.3: Enhanced Credit Notes Router

**Files:**
- Modify: `src/server/routers/creditNotes.ts`

Rewrite the router to support the full lifecycle:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { InvoiceType, InvoiceStatus, PrismaClient } from "@/generated/prisma";
import { generateCreditNoteNumber } from "../services/credit-note-numbering";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  type TaxInput,
  type LineInput,
} from "../services/tax-calculator";
import { logAudit } from "../services/audit";

// Re-export for test compatibility
export { validateCreditApplication };

function validateCreditApplication(
  applyAmount: number,
  creditRemaining: number,
  invoiceBalance: number,
): void {
  if (applyAmount > creditRemaining) {
    throw new Error(`Amount exceeds credit note remaining of ${creditRemaining}`);
  }
  if (applyAmount > invoiceBalance) {
    throw new Error(`Amount exceeds invoice balance of ${invoiceBalance}`);
  }
}

const creditNoteLineSchema = z.object({
  sort: z.number().int().default(0),
  name: z.string().min(1),
  description: z.string().optional(),
  qty: z.number().default(1),
  rate: z.number().default(0),
  taxIds: z.array(z.string()).default([]),
});

export const creditNotesRouter = router({
  /** List credit notes for a client */
  listForClient: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
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

  /** Get a single credit note with full details */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const cn = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId, type: InvoiceType.CREDIT_NOTE },
        include: {
          client: true,
          currency: true,
          organization: true,
          lines: {
            include: { taxes: { include: { tax: true } } },
            orderBy: { sort: "asc" },
          },
          creditNotesIssued: {
            include: { invoice: { select: { id: true, number: true } } },
          },
        },
      });
      if (!cn) throw new TRPCError({ code: "NOT_FOUND" });
      return cn;
    }),

  /** Create a credit note (optionally from a source invoice) */
  create: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        clientId: z.string(),
        currencyId: z.string(),
        sourceInvoiceId: z.string().optional(),
        notes: z.string().optional(),
        lines: z.array(creditNoteLineSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);

      return ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateCreditNoteNumber(txClient, ctx.orgId);

        const lineResults = input.lines.map((line) => {
          const lineInput: LineInput = {
            qty: line.qty,
            rate: line.rate,
            lineType: "STANDARD" as any,
            discount: 0,
            discountIsPercentage: false,
            taxIds: line.taxIds,
          };
          const lineTaxes = line.taxIds.flatMap((id) => {
            const t = taxMap.get(id);
            return t ? [t] : [];
          });
          const result = calculateLineTotals(lineInput, lineTaxes);
          return { line, result };
        });

        const invoiceTotals = calculateInvoiceTotals(
          input.lines.map((l) => ({
            qty: l.qty,
            rate: l.rate,
            lineType: "STANDARD" as any,
            discount: 0,
            discountIsPercentage: false,
            taxIds: l.taxIds,
          })),
          [...taxMap.values()],
        );

        const created = await tx.invoice.create({
          data: {
            number,
            type: InvoiceType.CREDIT_NOTE,
            status: InvoiceStatus.DRAFT,
            creditNoteStatus: "DRAFT",
            sourceInvoiceId: input.sourceInvoiceId,
            date: new Date(),
            currencyId: input.currencyId,
            clientId: input.clientId,
            organizationId: ctx.orgId,
            notes: input.notes,
            subtotal: invoiceTotals.subtotal,
            discountTotal: 0,
            taxTotal: invoiceTotals.taxTotal,
            total: invoiceTotals.total,
            lines: {
              create: lineResults.map(({ line, result }) => ({
                sort: line.sort,
                name: line.name,
                description: line.description,
                qty: line.qty,
                rate: line.rate,
                subtotal: result.subtotal,
                taxTotal: result.taxTotal,
                total: result.total,
                taxes: {
                  create: result.taxBreakdown.map((tb) => ({
                    taxId: tb.taxId,
                    taxAmount: tb.taxAmount,
                  })),
                },
              })),
            },
          },
          include: {
            client: true,
            currency: true,
            lines: { include: { taxes: { include: { tax: true } } } },
          },
        });

        await logAudit({
          action: "CREATED",
          entityType: "CreditNote",
          entityId: created.id,
          entityLabel: number,
          organizationId: ctx.orgId,
          userId: ctx.userId,
        }).catch(() => {});

        return created;
      });
    }),

  /** Issue a draft credit note (changes status to ISSUED) */
  issue: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cn = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!cn || cn.type !== InvoiceType.CREDIT_NOTE) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (cn.creditNoteStatus !== "DRAFT") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft credit notes can be issued" });
      }

      return ctx.db.invoice.update({
        where: { id: input.id },
        data: {
          creditNoteStatus: "ISSUED",
          status: InvoiceStatus.SENT, // Mark as "active"
        },
      });
    }),

  /** Void a credit note */
  void: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cn = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { creditNotesIssued: true },
      });
      if (!cn || cn.type !== InvoiceType.CREDIT_NOTE) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (cn.creditNotesIssued.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot void a credit note that has been applied to invoices",
        });
      }

      return ctx.db.invoice.update({
        where: { id: input.id },
        data: { creditNoteStatus: "VOIDED" },
      });
    }),

  /** Apply credit note to an invoice */
  applyToInvoice: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        creditNoteId: z.string(),
        invoiceId: z.string(),
        amount: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [creditNote, invoice] = await Promise.all([
        ctx.db.invoice.findFirst({
          where: {
            id: input.creditNoteId,
            organizationId: ctx.orgId,
            type: InvoiceType.CREDIT_NOTE,
          },
          include: { creditNotesIssued: true },
        }),
        ctx.db.invoice.findFirst({
          where: { id: input.invoiceId, organizationId: ctx.orgId },
          include: { payments: true, creditNotesReceived: true },
        }),
      ]);

      if (!creditNote || !invoice) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (creditNote.creditNoteStatus === "VOIDED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot apply a voided credit note" });
      }

      const totalApplied = creditNote.creditNotesIssued.reduce(
        (sum, a) => sum + Number(a.amount),
        0,
      );
      const creditRemaining = Number(creditNote.total) - totalApplied;

      const totalPaid = invoice.payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      const creditApplied = invoice.creditNotesReceived.reduce(
        (sum, a) => sum + Number(a.amount),
        0,
      );
      const invoiceBalance = Number(invoice.total) - totalPaid - creditApplied;

      try {
        validateCreditApplication(input.amount, creditRemaining, invoiceBalance);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (e as Error).message,
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const application = await tx.creditNoteApplication.create({
          data: {
            creditNoteId: input.creditNoteId,
            invoiceId: input.invoiceId,
            amount: input.amount,
            organizationId: ctx.orgId,
          },
        });

        // Check if credit note is fully applied
        const newTotalApplied = totalApplied + input.amount;
        if (newTotalApplied >= Number(creditNote.total)) {
          await tx.invoice.update({
            where: { id: input.creditNoteId },
            data: { creditNoteStatus: "APPLIED" },
          });
        }

        // Check if invoice is fully paid
        const newInvoiceBalance = invoiceBalance - input.amount;
        if (newInvoiceBalance <= 0) {
          await tx.invoice.update({
            where: { id: input.invoiceId },
            data: { status: InvoiceStatus.PAID },
          });
        }

        return application;
      });
    }),
});

// Helper — duplicated from invoices router for independence
async function getOrgTaxMap(db: PrismaClient, orgId: string): Promise<Map<string, TaxInput>> {
  const taxes = await db.tax.findMany({ where: { organizationId: orgId } });
  return new Map(
    taxes.map((t) => [t.id, { id: t.id, rate: t.rate.toNumber(), isCompound: t.isCompound }]),
  );
}
```

**Commit:**
```bash
git add src/server/routers/creditNotes.ts
git commit -m "feat(A1): enhance credit notes router with full lifecycle management"
```

### Step A1.4: "Issue Credit Note" Button on Invoice Detail

**Files:**
- Create: `src/components/invoices/IssueCreditNoteDialog.tsx`
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx`

**Create IssueCreditNoteDialog** (`src/components/invoices/IssueCreditNoteDialog.tsx`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";

interface LineItem {
  name: string;
  description?: string;
  qty: number;
  rate: number;
  taxIds: string[];
}

interface Props {
  invoiceId: string;
  clientId: string;
  currencyId: string;
  lines: LineItem[];
}

export function IssueCreditNoteDialog({
  invoiceId,
  clientId,
  currencyId,
  lines,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");
  const router = useRouter();

  const createMutation = trpc.creditNotes.create.useMutation({
    onSuccess: (cn) => {
      toast.success(`Credit note ${cn.number} created`);
      router.push(`/invoices/${cn.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  function toggleLine(idx: number) {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleCreate() {
    const creditLines = Array.from(selectedLines).map((idx, sort) => ({
      sort,
      name: lines[idx].name,
      description: lines[idx].description,
      qty: lines[idx].qty,
      rate: lines[idx].rate,
      taxIds: lines[idx].taxIds,
    }));

    if (creditLines.length === 0) {
      toast.error("Select at least one line item to credit");
      return;
    }

    createMutation.mutate({
      clientId,
      currencyId,
      sourceInvoiceId: invoiceId,
      notes: notes || undefined,
      lines: creditLines,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Issue Credit Note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue Credit Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select the line items to credit. The credit note will be created as a draft.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {lines.map((line, idx) => (
              <label
                key={idx}
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedLines.has(idx)}
                  onChange={() => toggleLine(idx)}
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{line.name}</p>
                  {line.description && (
                    <p className="text-xs text-muted-foreground">{line.description}</p>
                  )}
                </div>
                <span className="text-sm font-medium shrink-0">
                  ${(line.qty * line.rate).toFixed(2)}
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for credit..."
            />
          </div>
          <Button
            className="w-full"
            disabled={selectedLines.size === 0 || createMutation.isPending}
            onClick={handleCreate}
          >
            {createMutation.isPending ? "Creating..." : `Create Credit Note (${selectedLines.size} items)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Add to invoice detail page** (`src/app/(dashboard)/invoices/[id]/page.tsx`): Add the "Issue Credit Note" button in the actions section, visible for non-draft, non-credit-note invoices:

```tsx
import { IssueCreditNoteDialog } from "@/components/invoices/IssueCreditNoteDialog";

{/* Add in the actions area, near the existing buttons */}
{invoice.type !== "CREDIT_NOTE" && invoice.type !== "ESTIMATE" && invoice.status !== "DRAFT" && (
  <IssueCreditNoteDialog
    invoiceId={invoice.id}
    clientId={invoice.client.id}
    currencyId={invoice.currencyId}
    lines={invoice.lines.map((l) => ({
      name: l.name,
      description: l.description ?? undefined,
      qty: Number(l.qty),
      rate: Number(l.rate),
      taxIds: l.taxes.map((t) => t.taxId),
    }))}
  />
)}
```

**Commit:**
```bash
git add src/components/invoices/IssueCreditNoteDialog.tsx src/app/(dashboard)/invoices/[id]/page.tsx
git commit -m "feat(A1): add Issue Credit Note dialog on invoice detail page"
```

### Step A1.5: Credit Note Status Actions

**Files:**
- Create: `src/components/invoices/CreditNoteActions.tsx`

This component renders "Issue" and "Void" buttons for credit notes on their detail page:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  creditNoteId: string;
  status: string | null; // creditNoteStatus
}

export function CreditNoteActions({ creditNoteId, status }: Props) {
  const router = useRouter();

  const issueMutation = trpc.creditNotes.issue.useMutation({
    onSuccess: () => {
      toast.success("Credit note issued");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const voidMutation = trpc.creditNotes.void.useMutation({
    onSuccess: () => {
      toast.success("Credit note voided");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      {status === "DRAFT" && (
        <Button
          variant="default"
          size="sm"
          onClick={() => issueMutation.mutate({ id: creditNoteId })}
          disabled={issueMutation.isPending}
        >
          {issueMutation.isPending ? "Issuing..." : "Issue Credit Note"}
        </Button>
      )}
      {(status === "DRAFT" || status === "ISSUED") && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => voidMutation.mutate({ id: creditNoteId })}
          disabled={voidMutation.isPending}
        >
          {voidMutation.isPending ? "Voiding..." : "Void"}
        </Button>
      )}
    </>
  );
}
```

**Add to invoice detail page**: In the actions bar, add credit note actions when the invoice is a credit note:

```tsx
import { CreditNoteActions } from "@/components/invoices/CreditNoteActions";

{invoice.type === "CREDIT_NOTE" && (
  <CreditNoteActions
    creditNoteId={invoice.id}
    status={invoice.creditNoteStatus}
  />
)}
```

**Commit:**
```bash
git add src/components/invoices/CreditNoteActions.tsx src/app/(dashboard)/invoices/[id]/page.tsx
git commit -m "feat(A1): add Issue/Void actions for credit note detail page"
```

### Step A1.6: P&L Impact for Credit Notes

**Files:**
- Modify: `src/server/routers/reports.ts`

In the `profitLoss` procedure, credit notes issued should appear as negative revenue. After fetching payments (around line 194), also fetch applied credit notes:

```typescript
// In the profitLoss query, add:
const appliedCredits = await ctx.db.creditNoteApplication.findMany({
  where: {
    organizationId: ctx.orgId,
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          },
        }
      : {}),
  },
  select: { amount: true, createdAt: true },
});

const creditsByMonth = groupByMonth(
  appliedCredits,
  (c) => c.createdAt,
  (c) => Number(c.amount),
);

const totalCredits = Object.values(creditsByMonth).reduce((s, v) => s + v, 0);
```

Adjust the return to include credits:

```typescript
return {
  revenueByMonth,
  expensesByMonth,
  creditsByMonth,
  netByMonth,
  totalRevenue,
  totalExpenses,
  totalCredits,
  netIncome: totalRevenue - totalExpenses - totalCredits,
};
```

Also update `taxLiability` to exclude credit note invoices from tax calculations (add `type: { notIn: ["CREDIT_NOTE"] }` to the invoice where clause).

**Commit:**
```bash
git add src/server/routers/reports.ts
git commit -m "feat(A1): credit notes appear as negative revenue in P&L and excluded from tax liability"
```

### Step A1.7: Update Credit Notes Test

**Files:**
- Modify: `src/test/credit-notes.test.ts`

Expand the existing test file:

```typescript
import { describe, it, expect } from "vitest";
import { validateCreditApplication } from "@/server/routers/creditNotes";

describe("validateCreditApplication", () => {
  it("rejects if amount > credit note remaining", () => {
    expect(() => validateCreditApplication(150, 100, 200)).toThrow("exceeds");
  });
  it("rejects if amount > invoice balance", () => {
    expect(() => validateCreditApplication(150, 200, 100)).toThrow("exceeds");
  });
  it("accepts valid amount within both limits", () => {
    expect(() => validateCreditApplication(50, 100, 100)).not.toThrow();
  });
  it("accepts amount equal to credit note remaining", () => {
    expect(() => validateCreditApplication(100, 100, 200)).not.toThrow();
  });
  it("accepts amount equal to invoice balance", () => {
    expect(() => validateCreditApplication(100, 200, 100)).not.toThrow();
  });
  it("rejects zero amount scenario where credit is 0", () => {
    expect(() => validateCreditApplication(1, 0, 100)).toThrow("exceeds");
  });
  it("rejects zero amount scenario where balance is 0", () => {
    expect(() => validateCreditApplication(1, 100, 0)).toThrow("exceeds");
  });
});
```

**Run tests:**
```bash
npx vitest run src/test/credit-notes.test.ts
```

**Commit:**
```bash
git add src/test/credit-notes.test.ts
git commit -m "test(A1): expand credit note validation test coverage"
```

---

## Summary of All New/Modified Files

### New Files (Create)
| File | Feature |
|------|---------|
| `src/test/invoice-discount.test.ts` | A4 |
| `src/server/services/late-fees.ts` | A3 |
| `src/test/late-fees.test.ts` | A3 |
| `src/inngest/functions/late-fees.ts` | A3 |
| `src/server/routers/lateFees.ts` | A3 |
| `src/components/settings/LateFeeSettingsForm.tsx` | A3 |
| `src/app/(dashboard)/settings/policies/page.tsx` | A3 |
| `src/components/invoices/LateFeeSection.tsx` | A3 |
| `src/server/services/retainers.ts` | A2 |
| `src/test/retainers.test.ts` | A2 |
| `src/server/routers/retainers.ts` | A2 |
| `src/components/clients/RetainerPanel.tsx` | A2 |
| `src/components/invoices/ApplyRetainerDialog.tsx` | A2 |
| `src/server/services/credit-note-numbering.ts` | A1 |
| `src/test/credit-note-numbering.test.ts` | A1 |
| `src/components/invoices/IssueCreditNoteDialog.tsx` | A1 |
| `src/components/invoices/CreditNoteActions.tsx` | A1 |

### Modified Files
| File | Features |
|------|----------|
| `prisma/schema.prisma` | A4, A3, A2, A1 |
| `src/server/services/tax-calculator.ts` | A4 |
| `src/server/routers/invoices.ts` | A4 |
| `src/components/invoices/InvoiceForm.tsx` | A4 |
| `src/app/(dashboard)/invoices/[id]/page.tsx` | A4, A3, A2, A1 |
| `src/app/(dashboard)/invoices/[id]/edit/page.tsx` | A4 |
| `src/server/services/invoice-pdf.tsx` | A4, A3 |
| `src/server/routers/reports.ts` | A4, A2, A1 |
| `src/server/routers/organization.ts` | A3 |
| `src/app/(dashboard)/settings/page.tsx` | A3 |
| `src/app/api/inngest/route.ts` | A3 |
| `src/app/api/invoices/[id]/pdf/route.ts` | A3 |
| `src/server/routers/_app.ts` | A3, A2 |
| `src/server/routers/creditNotes.ts` | A1 |
| `src/test/credit-notes.test.ts` | A1 |

### Test Commands
```bash
# Run all Group A tests
npx vitest run src/test/invoice-discount.test.ts src/test/late-fees.test.ts src/test/retainers.test.ts src/test/credit-notes.test.ts src/test/credit-note-numbering.test.ts

# Run individual feature tests
npx vitest run src/test/invoice-discount.test.ts     # A4
npx vitest run src/test/late-fees.test.ts             # A3
npx vitest run src/test/retainers.test.ts             # A2
npx vitest run src/test/credit-notes.test.ts          # A1
npx vitest run src/test/credit-note-numbering.test.ts # A1
```

### Expected Test Output
```
 ✓ src/test/invoice-discount.test.ts (7 tests)
 ✓ src/test/late-fees.test.ts (11 tests)
 ✓ src/test/retainers.test.ts (8 tests)
 ✓ src/test/credit-notes.test.ts (7 tests)
 ✓ src/test/credit-note-numbering.test.ts (4 tests)

 Test Files  5 passed (5)
      Tests  37 passed (37)
```

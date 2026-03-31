# Tax Liability Report — Design Document

**Date**: 2026-03-31
**Status**: Approved

## Purpose

Provide a dedicated report page for accountants showing total tax liability by tax type across a date range, with both cash basis and accrual basis views, per-invoice detail breakdown, and CSV/PDF export.

## Architecture

No schema changes required. All data exists in `InvoiceLineTax` → `InvoiceLine` → `Invoice` → `Payment` relations.

### tRPC Procedure: `reports.taxLiability`

**Input**: `dateRangeSchema.extend({ basis: z.enum(["cash", "accrual"]) })`

**Query logic**:
- **Accrual basis**: Filter invoices by `invoiceDate` within date range. Sum `InvoiceLineTax.taxAmount` grouped by `Tax.name` and `Tax.rate`.
- **Cash basis**: Filter by `Payment.paymentDate` within date range. For partially paid invoices, prorate tax proportionally: `(paymentAmount / invoiceTotal) * taxAmount`.

**Return shape**:
```typescript
{
  summary: Array<{
    taxName: string;
    taxRate: number;
    totalCollected: number;
    invoiceCount: number;
  }>;
  details: Array<{
    invoiceNumber: string;
    clientName: string;
    invoiceDate: Date;
    invoiceTotal: number;
    taxName: string;
    taxRate: number;
    taxAmount: number;
    paymentStatus: string;
    paymentDate: Date | null;
  }>;
  grandTotal: number;
}
```

## UI & Page Layout

**Page**: `/reports/tax-liability` — async server component following existing report patterns.

**Components**:
- **ReportHeader**: Org letterhead, title "Tax Liability Report", date range
- **ReportFilters**: Date range picker with presets (This Year, Last Year, etc.) + basis toggle (Cash / Accrual) in filter slot
- **Summary cards**: One card per tax type — name, rate, total collected, invoice count
- **Grand total card**: Total tax liability for the period
- **Detail table**: Invoice Number, Client, Invoice Date, Invoice Total, Tax Name, Tax Rate, Tax Amount, Payment Status, Payment Date
- **Export buttons**: "Export CSV" and "Export PDF" in top-right

## Exports

**CSV** (`/api/reports/tax-liability/export`):
- GET route with `from`, `to`, `basis` query params
- Columns match detail table
- Uses `csvEscape()` for formula injection protection
- Filename: `tax-liability-{from}-{to}.csv`

**PDF** (`/api/reports/tax-liability/pdf`):
- GET route with same params
- Letterhead header, summary table by tax type, full detail table
- Filename: `tax-liability-{from}-{to}.pdf`

**Navigation**: Add card to reports index page (`/reports`) with tax icon.

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `src/app/(dashboard)/reports/tax-liability/page.tsx` |
| Create | `src/app/api/reports/tax-liability/export/route.ts` (CSV) |
| Create | `src/app/api/reports/tax-liability/pdf/route.ts` (PDF) |
| Modify | `src/server/routers/reports.ts` — add `taxLiability` procedure |
| Modify | `src/app/(dashboard)/reports/page.tsx` — add report card |

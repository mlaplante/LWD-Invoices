# Feature F: Accountant Export Pack

## Summary

A "Year-End Export" page that generates 4 reports (P&L, Expense Ledger, Payment Ledger, Tax Liability) for a selected fiscal year — as downloadable CSVs, formatted PDFs, or a bundled ZIP.

## Reports

1. **P&L Statement** — monthly revenue (paid invoices) vs. expenses, with annual totals
2. **Expense Ledger** — every expense with date, supplier, category, description, amount, tax
3. **Payment Ledger** — every payment with date, client, invoice #, amount, method, gateway fee
4. **Tax Liability Summary** — taxes collected grouped by tax name/rate, with totals

## Design

### Page: /reports/year-end

- Year selector dropdown (defaults to current year)
- Preview cards with summary numbers per report
- "Download All (ZIP)" button — all 4 CSVs + 4 PDFs bundled
- Individual CSV/PDF download buttons per report

### API: /api/reports/year-end

- Query params: year, format (zip|csv|pdf), report (pl|expenses|payments|tax)
- Generates files server-side, returns download response
- ZIP uses JSZip, CSV is plain string, PDF uses @react-pdf/renderer

### Data service

- All queries filtered by year + organizationId
- P&L: payments by month + expenses by month
- Expense Ledger: expenses with category + supplier joins
- Payment Ledger: payments with invoice + client joins
- Tax Liability: invoice line taxes aggregated by tax name/rate

## Data changes

None — query-only.

## Dependencies

- `jszip` (needs install)
- `@react-pdf/renderer` (already installed)

## Files

- `src/app/(dashboard)/reports/year-end/page.tsx`
- `src/app/api/reports/year-end/route.ts`
- `src/server/services/year-end-reports.ts`

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PLRow, ExpenseRow, PaymentRow, TaxRow, AgingSnapshotRow } from "./year-end-reports";

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica" },
  pageLandscape: { padding: 40, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 16 },
  table: { width: "100%" },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#222",
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  rowAlt: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: "#f4f4f4",
  },
  totalsRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: "#222",
    fontFamily: "Helvetica-Bold",
  },
  cell: { flex: 1 },
  cellRight: { flex: 1, textAlign: "right" },
  cellWide: { flex: 2 },
});

function money(n: number): string {
  return n.toFixed(2);
}

// ── Profit & Loss ────────────────────────────────────────────────────────────

function PLDoc({ rows, year }: { rows: PLRow[]; year: number }) {
  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      expenses: acc.expenses + r.expenses,
      net: acc.net + r.net,
    }),
    { revenue: 0, expenses: 0, net: 0 },
  );

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Profit &amp; Loss</Text>
        <Text style={s.subtitle}>Fiscal Year {year}</Text>
        <View style={s.table}>
          <View style={s.headerRow}>
            <Text style={s.cell}>Month</Text>
            <Text style={s.cellRight}>Revenue</Text>
            <Text style={s.cellRight}>Expenses</Text>
            <Text style={s.cellRight}>Net</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.cell}>{r.month}</Text>
              <Text style={s.cellRight}>{money(r.revenue)}</Text>
              <Text style={s.cellRight}>{money(r.expenses)}</Text>
              <Text style={s.cellRight}>{money(r.net)}</Text>
            </View>
          ))}
          <View style={s.totalsRow}>
            <Text style={s.cell}>Total</Text>
            <Text style={s.cellRight}>{money(totals.revenue)}</Text>
            <Text style={s.cellRight}>{money(totals.expenses)}</Text>
            <Text style={s.cellRight}>{money(totals.net)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPLPdf(rows: PLRow[], year: number): Promise<Buffer> {
  return renderToBuffer(<PLDoc rows={rows} year={year} />);
}

// ── Expense Ledger ───────────────────────────────────────────────────────────

function ExpenseDoc({ rows, year }: { rows: ExpenseRow[]; year: number }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.pageLandscape}>
        <Text style={s.title}>Expense Ledger</Text>
        <Text style={s.subtitle}>Fiscal Year {year}</Text>
        <View style={s.table}>
          <View style={s.headerRow}>
            <Text style={s.cell}>Date</Text>
            <Text style={s.cell}>Name</Text>
            <Text style={s.cell}>Supplier</Text>
            <Text style={s.cell}>Category</Text>
            <Text style={s.cellWide}>Description</Text>
            <Text style={s.cellRight}>Amount</Text>
            <Text style={s.cell}>Tax</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.cell}>{r.date}</Text>
              <Text style={s.cell}>{r.name}</Text>
              <Text style={s.cell}>{r.supplier}</Text>
              <Text style={s.cell}>{r.category}</Text>
              <Text style={s.cellWide}>{r.description}</Text>
              <Text style={s.cellRight}>{money(r.amount)}</Text>
              <Text style={s.cell}>{r.tax}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function renderExpensePdf(rows: ExpenseRow[], year: number): Promise<Buffer> {
  return renderToBuffer(<ExpenseDoc rows={rows} year={year} />);
}

// ── Payment Ledger ───────────────────────────────────────────────────────────

function PaymentDoc({ rows, year }: { rows: PaymentRow[]; year: number }) {
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const totalFees = rows.reduce((sum, r) => sum + r.gatewayFee, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.pageLandscape}>
        <Text style={s.title}>Payment Ledger</Text>
        <Text style={s.subtitle}>Fiscal Year {year}</Text>
        <View style={s.table}>
          <View style={s.headerRow}>
            <Text style={s.cell}>Date</Text>
            <Text style={s.cell}>Client</Text>
            <Text style={s.cell}>Invoice #</Text>
            <Text style={s.cellRight}>Amount</Text>
            <Text style={s.cell}>Method</Text>
            <Text style={s.cellRight}>Gateway Fee</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.cell}>{r.date}</Text>
              <Text style={s.cell}>{r.client}</Text>
              <Text style={s.cell}>{r.invoiceNumber}</Text>
              <Text style={s.cellRight}>{money(r.amount)}</Text>
              <Text style={s.cell}>{r.method}</Text>
              <Text style={s.cellRight}>{money(r.gatewayFee)}</Text>
            </View>
          ))}
          <View style={s.totalsRow}>
            <Text style={s.cell}>Total</Text>
            <Text style={s.cell} />
            <Text style={s.cell} />
            <Text style={s.cellRight}>{money(totalAmount)}</Text>
            <Text style={s.cell} />
            <Text style={s.cellRight}>{money(totalFees)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPaymentPdf(rows: PaymentRow[], year: number): Promise<Buffer> {
  return renderToBuffer(<PaymentDoc rows={rows} year={year} />);
}

// ── Tax Liability ────────────────────────────────────────────────────────────

function TaxDoc({ rows, year }: { rows: TaxRow[]; year: number }) {
  const totalCollected = rows.reduce((sum, r) => sum + r.totalCollected, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Tax Liability Summary</Text>
        <Text style={s.subtitle}>Fiscal Year {year}</Text>
        <View style={s.table}>
          <View style={s.headerRow}>
            <Text style={s.cell}>Tax Name</Text>
            <Text style={s.cellRight}>Rate (%)</Text>
            <Text style={s.cellRight}>Total Collected</Text>
            <Text style={s.cellRight}>Invoice Count</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.cell}>{r.taxName}</Text>
              <Text style={s.cellRight}>{money(r.rate)}</Text>
              <Text style={s.cellRight}>{money(r.totalCollected)}</Text>
              <Text style={s.cellRight}>{r.invoiceCount}</Text>
            </View>
          ))}
          <View style={s.totalsRow}>
            <Text style={s.cell}>Total</Text>
            <Text style={s.cellRight} />
            <Text style={s.cellRight}>{money(totalCollected)}</Text>
            <Text style={s.cellRight} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderTaxPdf(rows: TaxRow[], year: number): Promise<Buffer> {
  return renderToBuffer(<TaxDoc rows={rows} year={year} />);
}

// ── AR Aging Snapshot ──────────────────────────────────────────────────────────

function AgingDoc({ rows, year }: { rows: AgingSnapshotRow[]; year: number }) {
  const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Accounts Receivable Aging</Text>
        <Text style={s.subtitle}>As of December 31, {year}</Text>
        <View style={s.table}>
          <View style={s.headerRow}>
            <Text style={s.cell}>Invoice #</Text>
            <Text style={s.cellWide}>Client</Text>
            <Text style={s.cell}>Due Date</Text>
            <Text style={s.cell}>Bucket</Text>
            <Text style={s.cellRight}>Days Overdue</Text>
            <Text style={s.cellRight}>Balance Due</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.cell}>{r.number}</Text>
              <Text style={s.cellWide}>{r.client}</Text>
              <Text style={s.cell}>{r.dueDate}</Text>
              <Text style={s.cell}>{r.bucket}</Text>
              <Text style={s.cellRight}>{r.daysOverdue > 0 ? r.daysOverdue : "—"}</Text>
              <Text style={s.cellRight}>{money(r.balance)}</Text>
            </View>
          ))}
          <View style={s.totalsRow}>
            <Text style={s.cell}>Total</Text>
            <Text style={s.cellWide} />
            <Text style={s.cell} />
            <Text style={s.cell} />
            <Text style={s.cellRight} />
            <Text style={s.cellRight}>{money(totalBalance)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderAgingPdf(rows: AgingSnapshotRow[], year: number): Promise<Buffer> {
  return renderToBuffer(<AgingDoc rows={rows} year={year} />);
}

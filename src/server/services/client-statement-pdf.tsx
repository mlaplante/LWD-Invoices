import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { Client, Currency, Invoice, Organization } from "@/generated/prisma";

export type StatementInvoice = Pick<
  Invoice,
  "id" | "number" | "type" | "status" | "date" | "dueDate" | "total"
> & {
  currency: Currency;
  amountPaid: number; // sum of payments
};

export type StatementData = {
  client: Client;
  organization: Organization & { currency?: Currency };
  invoices: StatementInvoice[];
  from?: Date;
  to?: Date;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 48,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  orgName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  divider: {
    borderBottom: "1 solid #e5e7eb",
    marginVertical: 16,
  },
  twoCol: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  label: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  value: {
    fontSize: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    padding: "6 8",
    borderRadius: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    padding: "5 8",
    borderBottom: "1 solid #f3f4f6",
  },
  colInvoice: { flex: 2 },
  colDate: { flex: 1.5, textAlign: "left" },
  colDue: { flex: 1.5, textAlign: "left" },
  colStatus: { flex: 1.5, textAlign: "left" },
  colTotal: { flex: 1.5, textAlign: "right" },
  colPaid: { flex: 1.5, textAlign: "right" },
  colBalance: { flex: 1.5, textAlign: "right" },
  summarySection: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
    minWidth: 220,
  },
  summaryLabel: {
    flex: 1,
    textAlign: "right",
    paddingRight: 16,
    color: "#6b7280",
  },
  summaryValue: {
    width: 100,
    textAlign: "right",
  },
  summaryFinal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 6,
    paddingTop: 6,
    borderTop: "1.5 solid #1a1a1a",
    minWidth: 220,
  },
  summaryFinalLabel: {
    flex: 1,
    textAlign: "right",
    paddingRight: 16,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  summaryFinalValue: {
    width: 100,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
});

const TYPE_LABEL: Record<string, string> = {
  DETAILED: "Invoice",
  SIMPLE: "Invoice",
  ESTIMATE: "Estimate",
  CREDIT_NOTE: "Credit Note",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Unpaid",
  PARTIALLY_PAID: "Partial",
  PAID: "Paid",
  OVERDUE: "Overdue",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtAmt(n: number, sym: string, pos: string): string {
  const formatted = n.toFixed(2);
  return pos === "before" ? `${sym}${formatted}` : `${formatted}${sym}`;
}

function StatementDocument({ data }: { data: StatementData }) {
  const { client, organization, invoices, from, to } = data;

  // Use first invoice's currency for summary (mixed currencies unlikely for one client)
  const currency = invoices[0]?.currency;
  const sym = currency?.symbol ?? "$";
  const pos = currency?.symbolPosition ?? "before";

  const totalInvoiced = invoices.reduce((s, inv) => s + Number(inv.total), 0);
  const totalPaid = invoices.reduce((s, inv) => s + inv.amountPaid, 0);
  const outstanding = totalInvoiced - totalPaid;
  const brandColor = organization.brandColor ?? "#2563eb";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.orgName}>{organization.name}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.title, { color: brandColor }]}>STATEMENT</Text>
            {(from || to) && (
              <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                {from ? fmtDate(from) : "All time"} – {to ? fmtDate(to) : "Today"}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Client info + generated date */}
        <View style={styles.twoCol}>
          <View>
            <Text style={styles.label}>Prepared For</Text>
            <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>{client.name}</Text>
            {client.email ? <Text style={styles.value}>{client.email}</Text> : null}
            {client.address ? <Text style={styles.value}>{client.address}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.label}>Generated</Text>
            <Text style={styles.value}>{fmtDate(new Date())}</Text>
          </View>
        </View>

        {/* Invoice table */}
        <View style={styles.tableHeader}>
          {(["Invoice", "Date", "Due", "Status", "Total", "Paid", "Balance"] as const).map((h, i) => (
            <Text
              key={h}
              style={[
                i === 0 ? styles.colInvoice
                  : i === 1 ? styles.colDate
                  : i === 2 ? styles.colDue
                  : i === 3 ? styles.colStatus
                  : i === 4 ? styles.colTotal
                  : i === 5 ? styles.colPaid
                  : styles.colBalance,
                { fontFamily: "Helvetica-Bold", fontSize: 9 },
              ]}
            >
              {h}
            </Text>
          ))}
        </View>

        {invoices.length === 0 ? (
          <View style={{ padding: "16 8" }}>
            <Text style={{ color: "#6b7280" }}>No invoices for the selected period.</Text>
          </View>
        ) : (
          invoices.map((inv) => {
            const balance = Number(inv.total) - inv.amountPaid;
            return (
              <View key={inv.id} style={styles.tableRow}>
                <Text style={styles.colInvoice}>
                  {TYPE_LABEL[inv.type] ?? "Invoice"} #{inv.number}
                </Text>
                <Text style={styles.colDate}>{fmtDate(inv.date)}</Text>
                <Text style={styles.colDue}>{fmtDate(inv.dueDate)}</Text>
                <Text style={styles.colStatus}>{STATUS_LABEL[inv.status] ?? inv.status}</Text>
                <Text style={styles.colTotal}>{fmtAmt(Number(inv.total), sym, pos)}</Text>
                <Text style={styles.colPaid}>{fmtAmt(inv.amountPaid, sym, pos)}</Text>
                <Text style={[styles.colBalance, balance > 0 ? { color: "#d97706" } : {}]}>
                  {fmtAmt(balance, sym, pos)}
                </Text>
              </View>
            );
          })
        )}

        {/* Summary totals */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Invoiced</Text>
            <Text style={styles.summaryValue}>{fmtAmt(totalInvoiced, sym, pos)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={styles.summaryValue}>{fmtAmt(totalPaid, sym, pos)}</Text>
          </View>
          <View style={styles.summaryFinal}>
            <Text style={styles.summaryFinalLabel}>Outstanding</Text>
            <Text style={[styles.summaryFinalValue, outstanding > 0 ? { color: "#d97706" } : {}]}>
              {fmtAmt(outstanding, sym, pos)}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateClientStatementPDF(data: StatementData): Promise<Buffer> {
  const buffer = await renderToBuffer(<StatementDocument data={data} />);
  return Buffer.from(buffer);
}

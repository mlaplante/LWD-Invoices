import {
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import type { TemplateProps } from "./types";
import { formatAmount, formatDate } from "../pdf-shared";

export function ModernTemplate({ invoice, config }: TemplateProps) {
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmt = (n: number | string | { toNumber(): number }) =>
    formatAmount(n, sym, symPos);

  const typeLabel: Record<string, string> = {
    SIMPLE: "INVOICE",
    DETAILED: "INVOICE",
    ESTIMATE: "ESTIMATE",
    CREDIT_NOTE: "CREDIT NOTE",
  };

  const fontFamily = config.fontFamily;
  const boldFamily = `${fontFamily}-Bold`;
  const accentColor = config.accentColor;

  const styles = StyleSheet.create({
    page: {
      fontFamily,
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
      fontFamily: boldFamily,
      marginBottom: 4,
    },
    invoiceMeta: {
      alignItems: "flex-end",
    },
    invoiceTitle: {
      fontSize: 22,
      fontFamily: boldFamily,
      marginBottom: 4,
    },
    invoiceNumber: {
      fontSize: 11,
      color: "#555",
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
    colName: { flex: 3 },
    colQty: { flex: 1, textAlign: "right" },
    colRate: { flex: 1.5, textAlign: "right" },
    colAmount: { flex: 1.5, textAlign: "right" },
    totalsSection: {
      marginTop: 16,
      alignItems: "flex-end",
    },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 3,
      minWidth: 200,
    },
    totalsLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 16,
      color: "#6b7280",
    },
    totalsValue: {
      width: 90,
      textAlign: "right",
    },
    totalFinal: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 6,
      paddingTop: 6,
      borderTop: "1.5 solid #1a1a1a",
      minWidth: 200,
    },
    totalFinalLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 16,
      fontFamily: boldFamily,
      fontSize: 11,
    },
    totalFinalValue: {
      width: 90,
      textAlign: "right",
      fontFamily: boldFamily,
      fontSize: 11,
    },
    notes: {
      marginTop: 24,
      padding: 12,
      backgroundColor: "#f9fafb",
      borderRadius: 3,
    },
    notesLabel: {
      fontSize: 8,
      color: "#6b7280",
      textTransform: "uppercase",
      marginBottom: 4,
    },
    statusBadge: {
      fontSize: 9,
      padding: "3 8",
      borderRadius: 10,
      marginTop: 4,
    },
    footer: {
      marginTop: 32,
      paddingTop: 12,
      borderTop: "1 solid #e5e7eb",
      fontSize: 8,
      color: "#9ca3af",
      textAlign: "center",
    },
  });

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          {config.showLogo && invoice.organization.logoUrl ? (
            <Image
              src={invoice.organization.logoUrl}
              style={{
                height: 40,
                maxWidth: 160,
                marginBottom: 4,
                objectFit: "contain",
              }}
            />
          ) : null}
          <Text style={styles.orgName}>{invoice.organization.name}</Text>
          {invoice.organization.addressLine1 ? (
            <Text style={{ fontSize: 8, color: "#6b7280" }}>{invoice.organization.addressLine1}</Text>
          ) : null}
          {invoice.organization.addressLine2 ? (
            <Text style={{ fontSize: 8, color: "#6b7280" }}>{invoice.organization.addressLine2}</Text>
          ) : null}
          {(invoice.organization.city || invoice.organization.state || invoice.organization.postalCode) ? (
            <Text style={{ fontSize: 8, color: "#6b7280" }}>
              {[invoice.organization.city, invoice.organization.state].filter(Boolean).join(", ")}
              {invoice.organization.postalCode ? ` ${invoice.organization.postalCode}` : ""}
            </Text>
          ) : null}
          {invoice.organization.country ? (
            <Text style={{ fontSize: 8, color: "#6b7280" }}>{invoice.organization.country}</Text>
          ) : null}
          {invoice.organization.phone ? (
            <Text style={{ fontSize: 8, color: "#6b7280" }}>{invoice.organization.phone}</Text>
          ) : null}
        </View>
        <View style={styles.invoiceMeta}>
          <Text style={[styles.invoiceTitle, { color: accentColor }]}>
            {typeLabel[invoice.type] ?? "INVOICE"}
          </Text>
          <Text style={styles.invoiceNumber}>#{invoice.number}</Text>
          <Text style={[styles.statusBadge, { color: "#6b7280" }]}>
            {invoice.status.replace("_", " ")}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Bill To + Dates */}
      <View style={styles.twoCol}>
        <View>
          <Text style={styles.label}>Bill To</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.client.name}
          </Text>
          {invoice.client.email ? (
            <Text style={styles.value}>{invoice.client.email}</Text>
          ) : null}
          {invoice.client.address ? (
            <Text style={styles.value}>{invoice.client.address}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.label}>Date</Text>
          <Text style={[styles.value, { marginBottom: 8 }]}>
            {formatDate(invoice.date)}
          </Text>
          {invoice.dueDate ? (
            <>
              <Text style={styles.label}>Due Date</Text>
              <Text style={styles.value}>{formatDate(invoice.dueDate)}</Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Line Items Table */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colName, { fontFamily: boldFamily, fontSize: 9 }]}>
          Description
        </Text>
        <Text style={[styles.colQty, { fontFamily: boldFamily, fontSize: 9 }]}>
          Qty
        </Text>
        <Text style={[styles.colRate, { fontFamily: boldFamily, fontSize: 9 }]}>
          Rate
        </Text>
        <Text style={[styles.colAmount, { fontFamily: boldFamily, fontSize: 9 }]}>
          Amount
        </Text>
      </View>

      {invoice.lines
        .sort((a, b) => a.sort - b.sort)
        .map((line) => (
          <View key={line.id} style={styles.tableRow}>
            <View style={styles.colName}>
              <Text style={{ fontFamily: boldFamily }}>{line.name}</Text>
              {line.description ? (
                <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                  {line.description}
                </Text>
              ) : null}
              {Number(line.discount) > 0 ? (
                <Text style={{ fontSize: 8, color: "#059669", marginTop: 1 }}>
                  {line.discountIsPercentage
                    ? `${Number(line.discount)}% discount `
                    : "Discount "}
                  (-{fmt(
                    line.discountIsPercentage
                      ? Number(line.qty) * Number(line.rate) * Number(line.discount) / 100
                      : Number(line.discount)
                  )})
                </Text>
              ) : null}
            </View>
            <Text style={styles.colQty}>{Number(line.qty).toFixed(2)}</Text>
            <Text style={styles.colRate}>{fmt(line.rate)}</Text>
            <Text style={styles.colAmount}>{fmt(line.subtotal)}</Text>
          </View>
        ))}

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{fmt(invoice.subtotal)}</Text>
        </View>

        {invoice.discountType && Number(invoice.discountAmount) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              Invoice Discount
              {invoice.discountType === "percentage"
                ? ` (${Number(invoice.discountAmount)}%)`
                : ""}
            </Text>
            <Text style={styles.totalsValue}>
              -
              {fmt(
                invoice.discountType === "percentage"
                  ? (Number(invoice.subtotal) * Number(invoice.discountAmount)) /
                      100
                  : Number(invoice.discountAmount)
              )}
            </Text>
          </View>
        )}

        {Number(invoice.discountTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Discount</Text>
            <Text style={styles.totalsValue}>
              -{fmt(invoice.discountTotal)}
            </Text>
          </View>
        )}

        {Number(invoice.taxTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>{fmt(invoice.taxTotal)}</Text>
          </View>
        )}

        <View style={styles.totalFinal}>
          <Text style={styles.totalFinalLabel}>Total</Text>
          <Text style={styles.totalFinalValue}>{fmt(invoice.total)}</Text>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={{ fontSize: 9 }}>{invoice.notes}</Text>
        </View>
      )}

      {/* Payment Schedule */}
      {invoice.partialPayments.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.label, { marginBottom: 6 }]}>
            Payment Schedule
          </Text>
          {invoice.partialPayments.map((pp, i) => (
            <View
              key={pp.id}
              style={[
                styles.totalsRow,
                { minWidth: "auto" as unknown as number, justifyContent: "space-between" },
              ]}
            >
              <Text style={{ color: "#6b7280" }}>
                #{i + 1} · {formatDate(pp.dueDate)}
                {pp.isPaid ? " · Paid" : " · Pending"}
              </Text>
              <Text>
                {pp.isPercentage
                  ? `${Number(pp.amount).toFixed(0)}%`
                  : fmt(pp.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Payment History */}
      {invoice.payments.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.label, { marginBottom: 6 }]}>
            Payment History
          </Text>
          {invoice.payments.map((p) => (
            <View
              key={p.id}
              style={[
                styles.totalsRow,
                { minWidth: "auto" as unknown as number, justifyContent: "space-between" },
              ]}
            >
              <Text style={{ color: "#6b7280" }}>
                {formatDate(p.paidAt)} · {p.method}
              </Text>
              <Text>{fmt(p.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Late Fees */}
      {invoice.lateFeeEntries &&
        invoice.lateFeeEntries.filter((e) => !e.isWaived).length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.label, { marginBottom: 6 }]}>Late Fees</Text>
            {invoice.lateFeeEntries
              .filter((e) => !e.isWaived)
              .map((entry) => (
                <View
                  key={entry.id}
                  style={[
                    styles.totalsRow,
                    { minWidth: "auto" as unknown as number, justifyContent: "space-between" },
                  ]}
                >
                  <Text style={{ color: "#6b7280" }}>
                    {formatDate(entry.createdAt)} ·{" "}
                    {entry.feeType === "percentage"
                      ? `${Number(entry.feeRate)}%`
                      : "Flat fee"}
                  </Text>
                  <Text>{fmt(entry.amount)}</Text>
                </View>
              ))}
            <View
              style={[
                styles.totalsRow,
                {
                  minWidth: "auto" as unknown as number,
                  justifyContent: "space-between",
                  borderTop: "1 solid #e5e7eb",
                  paddingTop: 4,
                  marginTop: 4,
                },
              ]}
            >
              <Text style={{ fontFamily: boldFamily, fontSize: 10 }}>
                Late Fee Total
              </Text>
              <Text style={{ fontFamily: boldFamily, fontSize: 10 }}>
                {fmt(
                  invoice.lateFeeEntries
                    .filter((e) => !e.isWaived)
                    .reduce((sum, e) => sum + Number(e.amount), 0)
                )}
              </Text>
            </View>
          </View>
        )}

      {/* Footer */}
      {config.footerText && (
        <View style={styles.footer}>
          <Text>{config.footerText}</Text>
        </View>
      )}
    </Page>
  );
}

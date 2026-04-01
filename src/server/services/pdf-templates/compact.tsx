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

export function CompactTemplate({ invoice, config }: TemplateProps) {
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
      fontSize: 8,
      padding: 36,
      color: "#1a1a1a",
    },
    headerBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: accentColor,
      padding: "10 16",
      borderRadius: 4,
      marginBottom: 16,
    },
    headerTitle: {
      fontSize: 14,
      fontFamily: boldFamily,
      color: "#ffffff",
    },
    headerNumber: {
      fontSize: 10,
      color: "#ffffff",
    },
    infoGrid: {
      flexDirection: "row",
      marginBottom: 16,
      gap: 16,
    },
    infoBox: {
      flex: 1,
      padding: "8 10",
      backgroundColor: "#f9fafb",
      borderRadius: 3,
    },
    label: {
      fontSize: 7,
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    value: {
      fontSize: 8,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f3f4f6",
      padding: "4 6",
      borderTop: "1 solid #d1d5db",
      borderBottom: "1 solid #d1d5db",
    },
    tableRow: {
      flexDirection: "row",
      padding: "3 6",
      borderBottom: "0.5 solid #e5e7eb",
    },
    colName: { flex: 3 },
    colQty: { flex: 0.8, textAlign: "right" },
    colRate: { flex: 1.2, textAlign: "right" },
    colTax: { flex: 1, textAlign: "right" },
    colAmount: { flex: 1.2, textAlign: "right" },
    totalsSection: {
      marginTop: 8,
      alignItems: "flex-end",
    },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 2,
      minWidth: 180,
    },
    totalsLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 12,
      color: "#6b7280",
      fontSize: 8,
    },
    totalsValue: {
      width: 80,
      textAlign: "right",
      fontSize: 8,
    },
    totalFinal: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 4,
      paddingTop: 4,
      borderTop: "1.5 solid #1a1a1a",
      minWidth: 180,
    },
    totalFinalLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 12,
      fontFamily: boldFamily,
      fontSize: 10,
    },
    totalFinalValue: {
      width: 80,
      textAlign: "right",
      fontFamily: boldFamily,
      fontSize: 10,
      color: accentColor,
    },
    footer: {
      marginTop: 20,
      paddingTop: 8,
      borderTop: "0.5 solid #e5e7eb",
      fontSize: 7,
      color: "#9ca3af",
      textAlign: "center",
    },
  });

  return (
    <Page size="A4" style={styles.page}>
      {/* Colored header bar */}
      <View style={styles.headerBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {config.showLogo && invoice.organization.logoUrl ? (
            <Image
              src={invoice.organization.logoUrl}
              style={{ height: 24, maxWidth: 80, objectFit: "contain" }}
            />
          ) : null}
          <Text style={styles.headerTitle}>
            {typeLabel[invoice.type] ?? "INVOICE"}
          </Text>
        </View>
        <Text style={styles.headerNumber}>#{invoice.number}</Text>
      </View>

      {/* Info grid: From / To / Details */}
      <View style={styles.infoGrid}>
        <View style={styles.infoBox}>
          <Text style={styles.label}>From</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.organization.name}
          </Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.label}>Bill To</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.client.name}
          </Text>
          {invoice.client.email ? (
            <Text style={styles.value}>{invoice.client.email}</Text>
          ) : null}
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatDate(invoice.date)}</Text>
          {invoice.dueDate ? (
            <>
              <Text style={[styles.label, { marginTop: 4 }]}>Due</Text>
              <Text style={styles.value}>{formatDate(invoice.dueDate)}</Text>
            </>
          ) : null}
          <Text style={[styles.label, { marginTop: 4 }]}>Status</Text>
          <Text style={styles.value}>
            {invoice.status.replace("_", " ")}
          </Text>
        </View>
      </View>

      {/* Line Items Table with tax column */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colName, { fontFamily: boldFamily, fontSize: 7 }]}>
          Item
        </Text>
        <Text style={[styles.colQty, { fontFamily: boldFamily, fontSize: 7 }]}>
          Qty
        </Text>
        <Text style={[styles.colRate, { fontFamily: boldFamily, fontSize: 7 }]}>
          Rate
        </Text>
        <Text style={[styles.colTax, { fontFamily: boldFamily, fontSize: 7 }]}>
          Tax
        </Text>
        <Text style={[styles.colAmount, { fontFamily: boldFamily, fontSize: 7 }]}>
          Amount
        </Text>
      </View>

      {invoice.lines
        .sort((a, b) => a.sort - b.sort)
        .map((line) => {
          const lineTax = line.taxes.reduce(
            (sum, t) => sum + Number(t.taxAmount),
            0
          );
          return (
            <View key={line.id} style={styles.tableRow}>
              <View style={styles.colName}>
                <Text>{line.name}</Text>
                {line.description ? (
                  <Text style={{ fontSize: 7, color: "#6b7280" }}>
                    {line.description}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.colQty}>{Number(line.qty).toFixed(2)}</Text>
              <Text style={styles.colRate}>{fmt(line.rate)}</Text>
              <Text style={styles.colTax}>
                {lineTax > 0 ? fmt(lineTax) : "\u2014"}
              </Text>
              <Text style={styles.colAmount}>{fmt(line.subtotal)}</Text>
            </View>
          );
        })}

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{fmt(invoice.subtotal)}</Text>
        </View>

        {invoice.discountType && Number(invoice.discountAmount) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              Discount
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
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 7, color: "#6b7280", marginBottom: 2 }}>
            NOTES
          </Text>
          <Text style={{ fontSize: 7 }}>{invoice.notes}</Text>
        </View>
      )}

      {/* Payment Schedule + History -- side by side if both exist */}
      {(invoice.partialPayments.length > 0 ||
        invoice.payments.length > 0) && (
        <View style={{ flexDirection: "row", marginTop: 12, gap: 16 }}>
          {invoice.partialPayments.length > 0 && (
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 7,
                  color: "#6b7280",
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}
              >
                Payment Schedule
              </Text>
              {invoice.partialPayments.map((pp, i) => (
                <View
                  key={pp.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color: "#6b7280", fontSize: 7 }}>
                    #{i + 1} · {formatDate(pp.dueDate)}
                    {pp.isPaid ? " · Paid" : ""}
                  </Text>
                  <Text style={{ fontSize: 7 }}>
                    {pp.isPercentage
                      ? `${Number(pp.amount).toFixed(0)}%`
                      : fmt(pp.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {invoice.payments.length > 0 && (
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 7,
                  color: "#6b7280",
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}
              >
                Payment History
              </Text>
              {invoice.payments.map((p) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color: "#6b7280", fontSize: 7 }}>
                    {formatDate(p.paidAt)} · {p.method}
                  </Text>
                  <Text style={{ fontSize: 7 }}>{fmt(p.amount)}</Text>
                </View>
              ))}
            </View>
          )}
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

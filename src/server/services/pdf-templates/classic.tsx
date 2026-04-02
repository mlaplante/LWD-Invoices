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

export function ClassicTemplate({ invoice, config }: TemplateProps) {
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
      padding: 56,
      color: "#1a1a1a",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 16,
      borderBottom: "2 solid #1a1a1a",
      marginBottom: 24,
    },
    orgName: {
      fontSize: 20,
      fontFamily: boldFamily,
      color: accentColor,
      marginBottom: 4,
    },
    invoiceTitle: {
      fontSize: 14,
      fontFamily: boldFamily,
      textTransform: "uppercase",
      letterSpacing: 2,
    },
    invoiceNumber: {
      fontSize: 11,
      color: "#555",
      marginTop: 2,
    },
    rule: {
      borderBottom: "0.5 solid #d1d5db",
      marginVertical: 12,
    },
    thickRule: {
      borderBottom: "1 solid #1a1a1a",
      marginVertical: 12,
    },
    twoCol: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    label: {
      fontSize: 9,
      color: "#6b7280",
      textTransform: "uppercase",
      marginBottom: 3,
      letterSpacing: 0.5,
    },
    value: {
      fontSize: 10,
    },
    tableHeader: {
      flexDirection: "row",
      borderBottom: "1 solid #1a1a1a",
      paddingBottom: 4,
      marginBottom: 2,
    },
    tableRow: {
      flexDirection: "row",
      padding: "4 0",
      borderBottom: "0.5 solid #e5e7eb",
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
      marginTop: 8,
      paddingTop: 8,
      borderTop: "2 solid #1a1a1a",
      minWidth: 200,
    },
    totalFinalLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 16,
      fontFamily: boldFamily,
      fontSize: 12,
    },
    totalFinalValue: {
      width: 90,
      textAlign: "right",
      fontFamily: boldFamily,
      fontSize: 12,
      color: accentColor,
    },
    notes: {
      marginTop: 24,
      borderTop: "0.5 solid #d1d5db",
      paddingTop: 12,
    },
    notesLabel: {
      fontSize: 9,
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    footer: {
      marginTop: 32,
      paddingTop: 12,
      borderTop: "0.5 solid #d1d5db",
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
                height: 36,
                maxWidth: 140,
                marginBottom: 4,
                objectFit: "contain",
              }}
            />
          ) : null}
          <Text style={styles.orgName}>{invoice.organization.name}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.invoiceTitle}>
            {typeLabel[invoice.type] ?? "INVOICE"}
          </Text>
          <Text style={styles.invoiceNumber}>#{invoice.number}</Text>
          <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
            {invoice.status.replace("_", " ")}
          </Text>
        </View>
      </View>

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
          <Text style={styles.totalFinalLabel}>Total Due</Text>
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

      {/* Footer */}
      {config.footerText && (
        <View style={styles.footer}>
          <Text>{config.footerText}</Text>
        </View>
      )}
    </Page>
  );
}

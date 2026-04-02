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

export function MinimalTemplate({ invoice, config }: TemplateProps) {
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmt = (n: number | string | { toNumber(): number }) =>
    formatAmount(n, sym, symPos);

  const typeLabel: Record<string, string> = {
    SIMPLE: "Invoice",
    DETAILED: "Invoice",
    ESTIMATE: "Estimate",
    CREDIT_NOTE: "Credit Note",
  };

  const fontFamily = config.fontFamily;
  const boldFamily = `${fontFamily}-Bold`;
  const accentColor = config.accentColor;

  const styles = StyleSheet.create({
    page: {
      fontFamily,
      fontSize: 10,
      padding: 56,
      color: "#374151",
    },
    header: {
      marginBottom: 40,
    },
    orgName: {
      fontSize: 14,
      fontFamily: boldFamily,
      color: "#111827",
      marginBottom: 2,
    },
    invoiceLabel: {
      fontSize: 10,
      color: "#9ca3af",
      marginTop: 16,
    },
    invoiceNumber: {
      fontSize: 20,
      fontFamily: boldFamily,
      color: "#111827",
      marginTop: 2,
    },
    dotted: {
      borderBottom: "1 dotted #d1d5db",
      marginVertical: 20,
    },
    twoCol: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 28,
    },
    label: {
      fontSize: 9,
      color: "#9ca3af",
      marginBottom: 3,
    },
    value: {
      fontSize: 10,
      color: "#374151",
    },
    lineItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      padding: "8 0",
      borderBottom: "1 dotted #e5e7eb",
    },
    totalBlock: {
      marginTop: 24,
      alignItems: "flex-end",
    },
    totalLabel: {
      fontSize: 10,
      color: "#9ca3af",
      marginBottom: 4,
    },
    totalValue: {
      fontSize: 28,
      fontFamily: boldFamily,
      color: accentColor,
    },
    notes: {
      marginTop: 32,
    },
    footer: {
      marginTop: 40,
      fontSize: 8,
      color: "#9ca3af",
      textAlign: "center",
    },
  });

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        {config.showLogo && invoice.organization.logoUrl ? (
          <Image
            src={invoice.organization.logoUrl}
            style={{
              height: 32,
              maxWidth: 120,
              marginBottom: 8,
              objectFit: "contain",
            }}
          />
        ) : null}
        <Text style={styles.orgName}>{invoice.organization.name}</Text>
        <Text style={styles.invoiceLabel}>
          {typeLabel[invoice.type] ?? "Invoice"}
        </Text>
        <Text style={styles.invoiceNumber}>#{invoice.number}</Text>
      </View>

      <View style={styles.dotted} />

      {/* Bill To + Dates */}
      <View style={styles.twoCol}>
        <View>
          <Text style={styles.label}>To</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.client.name}
          </Text>
          {invoice.client.email ? (
            <Text style={styles.value}>{invoice.client.email}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatDate(invoice.date)}</Text>
          {invoice.dueDate ? (
            <>
              <Text style={[styles.label, { marginTop: 8 }]}>Due</Text>
              <Text style={styles.value}>{formatDate(invoice.dueDate)}</Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Line Items -- simplified list */}
      {invoice.lines
        .sort((a, b) => a.sort - b.sort)
        .map((line) => (
          <View key={line.id} style={styles.lineItem}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: boldFamily, color: "#111827" }}>
                {line.name}
              </Text>
              {line.description ? (
                <Text style={{ fontSize: 9, color: "#9ca3af", marginTop: 1 }}>
                  {line.description}
                </Text>
              ) : null}
              <Text style={{ fontSize: 9, color: "#9ca3af", marginTop: 1 }}>
                {Number(line.qty).toFixed(2)} x {fmt(line.rate)}
              </Text>
            </View>
            <Text style={{ fontFamily: boldFamily, color: "#111827" }}>
              {fmt(line.subtotal)}
            </Text>
          </View>
        ))}

      {/* Total */}
      <View style={styles.totalBlock}>
        {Number(invoice.taxTotal) > 0 && (
          <Text style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>
            Includes {fmt(invoice.taxTotal)} tax
          </Text>
        )}
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{fmt(invoice.total)}</Text>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>
            Notes
          </Text>
          <Text style={{ fontSize: 9, color: "#374151" }}>
            {invoice.notes}
          </Text>
        </View>
      )}

      {/* Payment History */}
      {invoice.payments.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 9, color: "#9ca3af", marginBottom: 6 }}>
            Payments
          </Text>
          {invoice.payments.map((p) => (
            <View
              key={p.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text style={{ fontSize: 9, color: "#6b7280" }}>
                {formatDate(p.paidAt)} · {p.method}
              </Text>
              <Text style={{ fontSize: 9 }}>{fmt(p.amount)}</Text>
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

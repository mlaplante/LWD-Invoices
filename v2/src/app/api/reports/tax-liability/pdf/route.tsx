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

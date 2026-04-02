import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { FullInvoice } from "./invoice-pdf";
import type { ProposalContent } from "@/generated/prisma";
import { formatAmount, formatDate } from "./pdf-shared";
import { substituteVariables } from "../routers/proposals-helpers";
import { decryptSignature } from "./signature";

type ProposalSection = { key: string; title: string; content: string | null };

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 48,
    color: "#1a1a1a",
  },
  coverPage: {
    justifyContent: "center",
    alignItems: "center",
    padding: 48,
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 40,
  },
  coverClient: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  coverMeta: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
    paddingBottom: 6,
    borderBottom: "2 solid #e5e7eb",
  },
  h2: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 6,
  },
  h3: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 6,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 3,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 10,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.5,
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
  totalsSection: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 3,
    minWidth: 200,
  },
  totalsLabel: { flex: 1, textAlign: "right", paddingRight: 16, color: "#6b7280" },
  totalsValue: { width: 90, textAlign: "right" },
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
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  totalFinalValue: {
    width: 90,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  mdTableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottom: "1 solid #d1d5db",
  },
  mdTableRow: {
    flexDirection: "row",
    borderBottom: "1 solid #f3f4f6",
  },
  mdTableCell: {
    flex: 1,
    padding: "4 6",
    fontSize: 9,
  },
  mdTableHeaderCell: {
    flex: 1,
    padding: "4 6",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  signatureBlock: {
    marginTop: 32,
    padding: 20,
    borderTop: "2 solid #e5e7eb",
  },
  signatureLabel: {
    fontSize: 8,
    color: "#6b7280",
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    marginBottom: 8,
  },
  signatureImage: {
    height: 60,
    objectFit: "contain" as const,
    marginBottom: 8,
  },
  signatureDetail: {
    fontSize: 9,
    color: "#4b5563",
    marginBottom: 3,
  },
  signatureDetailBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    marginBottom: 3,
  },
});

function parseTableRow(line: string): string[] {
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s:?-]+\|/.test(line);
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Markdown table: header row, separator row, then data rows
    if (line.startsWith("|") && lines[i + 1] && isTableSeparator(lines[i + 1])) {
      const headerCells = parseTableRow(line);
      i++; // skip separator
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].startsWith("|")) {
        i++;
        rows.push(parseTableRow(lines[i]));
      }
      elements.push(
        <View key={`table-${i}`} style={{ marginVertical: 6 }}>
          <View style={styles.mdTableHeader}>
            {headerCells.map((cell, ci) => (
              <Text key={ci} style={styles.mdTableHeaderCell}>{cell}</Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.mdTableRow}>
              {row.map((cell, ci) => (
                <Text key={ci} style={styles.mdTableCell}>{cell}</Text>
              ))}
            </View>
          ))}
        </View>
      );
      continue;
    }

    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      elements.push(<Text key={i} style={styles.h3}>{h3Match[1]}</Text>);
      continue;
    }

    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      elements.push(<Text key={i} style={styles.h2}>{h2Match[1]}</Text>);
      continue;
    }

    const bulletMatch = line.match(/^[-*] (.+)$/);
    if (bulletMatch) {
      elements.push(
        <View key={i} style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{renderInlineMarkdown(bulletMatch[1])}</Text>
        </View>
      );
      continue;
    }

    if (line.trim() === "") continue;

    elements.push(
      <Text key={i} style={styles.paragraph}>{renderInlineMarkdown(line)}</Text>
    );
  }

  return <View>{elements}</View>;
}

function renderInlineMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
}

function BudgetSection({ invoice, fmt }: { invoice: FullInvoice; fmt: (n: number | string | { toNumber(): number }) => string }) {
  return (
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.colName, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Description</Text>
        <Text style={[styles.colQty, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Qty</Text>
        <Text style={[styles.colRate, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Rate</Text>
        <Text style={[styles.colAmount, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Amount</Text>
      </View>
      {invoice.lines.sort((a, b) => a.sort - b.sort).map((line) => (
        <View key={line.id} style={styles.tableRow}>
          <View style={styles.colName}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{line.name}</Text>
            {line.description ? (
              <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{line.description}</Text>
            ) : null}
          </View>
          <Text style={styles.colQty}>{Number(line.qty).toFixed(2)}</Text>
          <Text style={styles.colRate}>{fmt(line.rate)}</Text>
          <Text style={styles.colAmount}>{fmt(line.subtotal)}</Text>
        </View>
      ))}
      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{fmt(invoice.subtotal)}</Text>
        </View>
        {Number(invoice.discountTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Discount</Text>
            <Text style={styles.totalsValue}>-{fmt(invoice.discountTotal)}</Text>
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
    </View>
  );
}

function SignatureBlock({ invoice }: { invoice: FullInvoice }) {
  if (!invoice.signedAt || !invoice.signatureData) return null;

  let signatureDataUrl: string;
  try {
    signatureDataUrl = decryptSignature(invoice.signatureData);
  } catch {
    return null;
  }

  return (
    <View style={styles.signatureBlock}>
      <Text style={styles.signatureLabel}>ELECTRONICALLY SIGNED</Text>
      {signatureDataUrl.startsWith("data:image/") && (
        <Image src={signatureDataUrl} style={styles.signatureImage} />
      )}
      <Text style={styles.signatureDetailBold}>{invoice.signedByName}</Text>
      {invoice.signedByEmail && (
        <Text style={styles.signatureDetail}>{invoice.signedByEmail}</Text>
      )}
      <Text style={styles.signatureDetail}>
        Signed: {formatDate(invoice.signedAt)}
      </Text>
      {invoice.signedByIp && (
        <Text style={styles.signatureDetail}>IP: {invoice.signedByIp}</Text>
      )}
    </View>
  );
}

function ProposalDocument({
  invoice,
  proposal,
}: {
  invoice: FullInvoice;
  proposal: ProposalContent;
}) {
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmt = (n: number | string | { toNumber(): number }) => formatAmount(n, sym, symPos);
  const brandColor = invoice.organization.brandColor ?? "#2563eb";

  const variables: Record<string, string> = {
    client_name: invoice.client.name,
    client_url: "",
    client_email: invoice.client.email ?? "",
    date: formatDate(invoice.date),
  };

  const sections = proposal.sections as ProposalSection[];

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={[styles.page, styles.coverPage]}>
        {invoice.organization.logoUrl ? (
          <Image
            src={invoice.organization.logoUrl}
            style={{ height: 60, maxWidth: 200, marginBottom: 24, objectFit: "contain" }}
          />
        ) : null}
        <Text style={[styles.coverTitle, { color: brandColor }]}>PROJECT PROPOSAL</Text>
        <Text style={styles.coverSubtitle}>{invoice.organization.name}</Text>
        <Text style={styles.coverClient}>{invoice.client.name}</Text>
        <Text style={styles.coverMeta}>Version {proposal.version}</Text>
        <Text style={styles.coverMeta}>{formatDate(invoice.date)}</Text>
      </Page>

      {/* Content Pages */}
      {sections.map((section, idx) => (
        <Page key={section.key} size="A4" style={styles.page}>
          <Text style={[styles.sectionTitle, { borderBottomColor: brandColor }]}>
            {section.title}
          </Text>
          {section.key === "budget" ? (
            <BudgetSection invoice={invoice} fmt={fmt} />
          ) : section.content ? (
            <MarkdownContent
              content={substituteVariables(section.content, variables) ?? ""}
            />
          ) : null}
          {/* Add signature block on the last page */}
          {idx === sections.length - 1 && invoice.signedAt && (
            <SignatureBlock invoice={invoice} />
          )}
        </Page>
      ))}
    </Document>
  );
}

export async function generateProposalPDF(
  invoice: FullInvoice,
  proposal: ProposalContent
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <ProposalDocument invoice={invoice} proposal={proposal} />
  );
  return Buffer.from(buffer);
}

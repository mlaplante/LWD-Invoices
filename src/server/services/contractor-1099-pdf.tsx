import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Form1099Pack, Contractor1099Row, Payer } from "./contractor-1099";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 16 },
  disclaimer: {
    fontSize: 7.5,
    color: "#777",
    marginTop: 14,
    lineHeight: 1.4,
  },
  // ── Summary table ──
  table: { width: "100%" },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#222",
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  row: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 6 },
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
  // ── Form facsimile ──
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  formMeta: { textAlign: "right" },
  partyRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  party: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#222",
    padding: 8,
    minHeight: 88,
  },
  partyLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#555",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  partyName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  partyLine: { fontSize: 9, marginTop: 1 },
  boxRow: { flexDirection: "row", gap: 10 },
  box: { borderWidth: 1, borderColor: "#222", padding: 8 },
  boxLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#555" },
  boxAmount: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 4 },
  small: { fontSize: 8, color: "#555" },
});

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function cityStateZip(p: { city: string; state: string; zip?: string; postalCode?: string }): string {
  const zip = p.zip ?? p.postalCode ?? "";
  return [[p.city, p.state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
}

const DISCLAIMER =
  "This is an informational worksheet / recipient copy generated from your records. " +
  "It is NOT the official IRS scannable form. To file with the IRS, transcribe these " +
  "figures onto the official red-ink Form 1099-NEC or e-file through the IRS FIRE/IRIS " +
  "system or an authorized provider. Verify each recipient's name and TIN against their W-9.";

// ── Summary document ──────────────────────────────────────────────────────────

function SummaryDoc({ pack }: { pack: Form1099Pack }) {
  const eligible = pack.rows.filter((r) => r.eligible);
  const eligibleTotal = eligible.reduce((sum, r) => sum + r.total, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>1099-NEC Summary</Text>
        <Text style={s.subtitle}>
          Tax Year {pack.year} · {eligible.length} contractor
          {eligible.length === 1 ? "" : "s"} require a 1099-NEC (paid &ge; {money(pack.threshold)})
        </Text>
        <View style={s.table}>
          <View style={s.headerRow}>
            <Text style={s.cellWide}>Contractor</Text>
            <Text style={s.cell}>TIN</Text>
            <Text style={s.cellRight}>Box 1</Text>
            <Text style={s.cellRight}>Payments</Text>
            <Text style={s.cell}>W-9</Text>
            <Text style={s.cell}>Status</Text>
          </View>
          {pack.rows.map((r, i) => (
            <View key={r.contractorId} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.cellWide}>{r.legalName}</Text>
              <Text style={s.cell}>{r.tinMasked || "—"}</Text>
              <Text style={s.cellRight}>{money(r.total)}</Text>
              <Text style={s.cellRight}>{r.paymentCount}</Text>
              <Text style={s.cell}>{r.w9OnFile ? "Yes" : "No"}</Text>
              <Text style={s.cell}>
                {r.exempt
                  ? "Exempt"
                  : !r.meetsThreshold
                  ? "Below"
                  : r.missingW9
                  ? "W-9 missing"
                  : "Eligible"}
              </Text>
            </View>
          ))}
          <View style={s.totalsRow}>
            <Text style={s.cellWide}>Total (eligible)</Text>
            <Text style={s.cell} />
            <Text style={s.cellRight}>{money(eligibleTotal)}</Text>
            <Text style={s.cellRight} />
            <Text style={s.cell} />
            <Text style={s.cell} />
          </View>
        </View>
        <Text style={s.disclaimer}>{DISCLAIMER}</Text>
      </Page>
    </Document>
  );
}

// ── Per-contractor 1099-NEC facsimile ─────────────────────────────────────────

function FormPage({
  payer,
  row,
  year,
}: {
  payer: Payer;
  row: Contractor1099Row;
  year: number;
}) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.formHeader}>
        <View>
          <Text style={s.title}>Form 1099-NEC</Text>
          <Text style={s.small}>Nonemployee Compensation</Text>
        </View>
        <View style={s.formMeta}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{year}</Text>
          <Text style={s.small}>OMB No. 1545-0116</Text>
        </View>
      </View>

      <View style={s.partyRow}>
        <View style={s.party}>
          <Text style={s.partyLabel}>Payer</Text>
          <Text style={s.partyName}>{payer.name || "—"}</Text>
          {payer.addressLine1 ? <Text style={s.partyLine}>{payer.addressLine1}</Text> : null}
          {payer.addressLine2 ? <Text style={s.partyLine}>{payer.addressLine2}</Text> : null}
          <Text style={s.partyLine}>{cityStateZip(payer)}</Text>
          {payer.phone ? <Text style={s.partyLine}>{payer.phone}</Text> : null}
          <Text style={[s.partyLine, { marginTop: 4 }]}>
            Payer&apos;s TIN: {payer.tin || "—"}
          </Text>
        </View>
        <View style={s.party}>
          <Text style={s.partyLabel}>Recipient</Text>
          <Text style={s.partyName}>{row.legalName}</Text>
          {row.businessName ? <Text style={s.partyLine}>{row.businessName}</Text> : null}
          {row.addressLine1 ? <Text style={s.partyLine}>{row.addressLine1}</Text> : null}
          {row.addressLine2 ? <Text style={s.partyLine}>{row.addressLine2}</Text> : null}
          <Text style={s.partyLine}>{cityStateZip(row)}</Text>
          <Text style={[s.partyLine, { marginTop: 4 }]}>
            Recipient&apos;s TIN: {row.tinMasked || "—"}
          </Text>
        </View>
      </View>

      <View style={s.boxRow}>
        <View style={[s.box, { flex: 1 }]}>
          <Text style={s.boxLabel}>1  Nonemployee compensation</Text>
          <Text style={s.boxAmount}>{money(row.total)}</Text>
        </View>
        <View style={[s.box, { flex: 1 }]}>
          <Text style={s.boxLabel}>4  Federal income tax withheld</Text>
          <Text style={s.boxAmount}>$0.00</Text>
        </View>
      </View>

      {row.missingW9 ? (
        <Text style={[s.small, { marginTop: 10, color: "#b45309" }]}>
          ⚠ No W-9 on file for this recipient. Collect a signed W-9 and verify the TIN before filing.
        </Text>
      ) : null}

      <Text style={s.disclaimer}>{DISCLAIMER}</Text>
    </Page>
  );
}

function FormsDoc({ pack }: { pack: Form1099Pack }) {
  const eligible = pack.rows.filter((r) => r.eligible);
  return (
    <Document>
      {eligible.length === 0 ? (
        <Page size="A4" style={s.page}>
          <Text style={s.title}>Form 1099-NEC</Text>
          <Text style={s.subtitle}>Tax Year {pack.year}</Text>
          <Text style={s.small}>
            No contractors met the {money(pack.threshold)} reporting threshold for this year.
          </Text>
        </Page>
      ) : (
        eligible.map((row) => (
          <FormPage key={row.contractorId} payer={pack.payer} row={row} year={pack.year} />
        ))
      )}
    </Document>
  );
}

export async function render1099SummaryPdf(pack: Form1099Pack): Promise<Buffer> {
  return renderToBuffer(<SummaryDoc pack={pack} />);
}

export async function render1099FormsPdf(pack: Form1099Pack): Promise<Buffer> {
  return renderToBuffer(<FormsDoc pack={pack} />);
}

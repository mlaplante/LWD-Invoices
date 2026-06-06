import { describe, it, expect } from "vitest";
import { pack1099ToCsv } from "@/server/services/contractor-1099-csv";
import type { Form1099Pack, Contractor1099Row } from "@/server/services/contractor-1099";

function makeRow(overrides: Partial<Contractor1099Row> = {}): Contractor1099Row {
  return {
    contractorId: "c_1",
    legalName: "Jane Doe",
    businessName: "",
    taxClassification: "individual",
    tinType: "SSN",
    tinMasked: "***-**-6789",
    hasTin: true,
    addressLine1: "1 Main St",
    addressLine2: "",
    city: "Austin",
    state: "TX",
    zip: "78701",
    country: "US",
    total: 1500,
    paymentCount: 3,
    exempt: false,
    w9OnFile: true,
    meetsThreshold: true,
    eligible: true,
    missingW9: false,
    ...overrides,
  };
}

function makePack(rows: Contractor1099Row[]): Form1099Pack {
  return {
    year: 2025,
    threshold: 600,
    payer: {
      name: "Acme LLC",
      tin: "12-3456789",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      phone: "",
    },
    rows,
  };
}

describe("pack1099ToCsv", () => {
  it("includes a header and a row per contractor", () => {
    const csv = pack1099ToCsv(makePack([makeRow()]));
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Legal Name");
    expect(lines[0]).toContain("Box 1 Nonemployee Comp (2025)");
    expect(lines[1]).toContain("Jane Doe");
    expect(lines[1]).toContain("1500.00");
    expect(lines[1]).toContain("Yes"); // W-9 on file
  });

  it("sums only eligible rows in the totals line", () => {
    const csv = pack1099ToCsv(
      makePack([
        makeRow({ total: 1500, eligible: true }),
        makeRow({ contractorId: "c_2", total: 200, eligible: false, meetsThreshold: false }),
      ]),
    );
    const lines = csv.split("\n");
    const totalLine = lines[lines.length - 1];
    expect(totalLine).toContain("Total (eligible)");
    expect(totalLine).toContain("1500.00");
  });

  it("labels status for exempt, below-threshold, and missing-W-9 rows", () => {
    const csv = pack1099ToCsv(
      makePack([
        makeRow({ contractorId: "a", exempt: true }),
        makeRow({ contractorId: "b", meetsThreshold: false, eligible: false }),
        makeRow({ contractorId: "d", w9OnFile: false, missingW9: true }),
      ]),
    );
    expect(csv).toContain("Exempt");
    expect(csv).toContain("Below threshold");
    expect(csv).toContain("Eligible — W-9 missing");
  });

  it("neutralizes formula-injection in contractor names", () => {
    const csv = pack1099ToCsv(makePack([makeRow({ legalName: "=cmd()" })]));
    // Leading '=' is prefixed with a quote, and the cell is wrapped because the
    // value now contains characters needing escaping is not required, but the
    // apostrophe guard must be present.
    expect(csv).toContain("'=cmd()");
  });
});

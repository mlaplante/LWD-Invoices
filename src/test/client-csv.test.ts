import { describe, it, expect } from "vitest";
import {
  MAX_IMPORT_ROWS,
  MAX_TAGS_PER_CLIENT,
  normalizeTags,
  parseClientsCsv,
  parseCsvRecords,
} from "@/server/services/client-csv";

describe("normalizeTags", () => {
  it("trims, drops empties, and dedupes case-insensitively keeping first casing", () => {
    expect(normalizeTags([" Retainer ", "retainer", "", "  ", "Net-60"])).toEqual([
      "Retainer",
      "Net-60",
    ]);
  });

  it("caps the list at the per-client maximum", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS_PER_CLIENT);
  });

  it("truncates over-long tags", () => {
    const [tag] = normalizeTags(["x".repeat(100)]);
    expect(tag).toHaveLength(40);
  });
});

describe("parseCsvRecords", () => {
  it("splits simple rows on commas and newlines", () => {
    expect(parseCsvRecords("a,b\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles quoted cells containing commas, newlines, and escaped quotes", () => {
    const text = '"Acme, Inc.","line1\nline2","She said ""hi"""\n';
    expect(parseCsvRecords(text)).toEqual([["Acme, Inc.", "line1\nline2", 'She said "hi"']]);
  });

  it("skips blank lines and tolerates CRLF", () => {
    expect(parseCsvRecords("a,b\r\n\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseClientsCsv", () => {
  it("maps aliased headers case-insensitively", () => {
    const csv = "Client Name,Email Address,Postal Code,VAT\nAcme,ar@acme.test,90210,DE123\n";
    const { rows, errors } = parseClientsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      expect.objectContaining({ name: "Acme", email: "ar@acme.test", zip: "90210", taxId: "DE123" }),
    ]);
  });

  it("rejects files without a name column", () => {
    const { rows, errors } = parseClientsCsv("email\nx@y.test\n");
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/name/i);
  });

  it("collects per-row errors without sinking the rest of the file", () => {
    const csv = "name,email\nAcme,ar@acme.test\n,missing@name.test\nBeta,not-an-email\n";
    const { rows, errors } = parseClientsCsv(csv);
    expect(rows.map((r) => r.name)).toEqual(["Acme", "Beta"]);
    // Bad email is reported but the row still imports without it.
    expect(rows[1].email).toBeUndefined();
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(3);
    expect(errors[1].line).toBe(4);
  });

  it("splits tags on semicolons and pipes", () => {
    const csv = 'name,tags\nAcme,"retainer; net-60|agency"\n';
    const { rows } = parseClientsCsv(csv);
    expect(rows[0].tags).toEqual(["retainer", "net-60", "agency"]);
  });

  it('parses payment terms like "Net 30"', () => {
    const csv = "name,payment terms\nAcme,Net 30\nBeta,45\nGamma,soon\n";
    const { rows, errors } = parseClientsCsv(csv);
    expect(rows[0].defaultPaymentTermsDays).toBe(30);
    expect(rows[1].defaultPaymentTermsDays).toBe(45);
    expect(rows[2].defaultPaymentTermsDays).toBeUndefined();
    expect(errors[0].message).toMatch(/payment terms/i);
  });

  it("caps imports at the row limit", () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => `Client ${i}`).join("\n");
    const { rows, errors } = parseClientsCsv(`name\n${body}\n`);
    expect(rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(errors.some((e) => e.message.includes("capped"))).toBe(true);
  });
});

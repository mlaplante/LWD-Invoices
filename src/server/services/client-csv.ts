/**
 * Client CSV import — parsing and normalization only. The clients router owns
 * persistence (duplicate handling, tokens, audit) so this module stays pure
 * and unit-testable.
 *
 * Accepted columns (header names matched case- and punctuation-insensitively):
 *   name (required), email, phone, address, city, state, zip, country,
 *   tax id, notes, tags, payment terms
 * Tags within a cell are separated by ";" or "|" (commas would fight the CSV).
 */

export const MAX_TAGS_PER_CLIENT = 20;
export const MAX_TAG_LENGTH = 40;
export const MAX_IMPORT_ROWS = 500;

/**
 * Trim, drop empties, cap length, and dedupe case-insensitively (first casing
 * wins). Shared by the import path and the clients router create/update.
 */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_CLIENT) break;
  }
  return out;
}

export type ParsedClientRow = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  taxId?: string;
  notes?: string;
  tags: string[];
  defaultPaymentTermsDays?: number;
};

export type CsvRowError = { line: number; message: string };

export type ParseClientsCsvResult = {
  rows: ParsedClientRow[];
  errors: CsvRowError[];
};

/** RFC 4180 field splitter: handles quoted cells, escaped quotes, CRLF. */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    // Skip records that are entirely empty (blank lines).
    if (record.length > 1 || record[0].trim() !== "") records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || record.length > 0) pushRecord();
  return records;
}

type StringField = "name" | "email" | "phone" | "address" | "city" | "state" | "zip" | "country" | "taxId" | "notes";

const HEADER_ALIASES: Record<string, StringField | "tags" | "paymentTerms"> = {
  name: "name",
  clientname: "name",
  company: "name",
  email: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  address: "address",
  street: "address",
  addressline1: "address",
  city: "city",
  state: "state",
  province: "state",
  stateprovince: "state",
  zip: "zip",
  zipcode: "zip",
  postalcode: "zip",
  country: "country",
  taxid: "taxId",
  vat: "taxId",
  taxidvat: "taxId",
  notes: "notes",
  tags: "tags",
  labels: "tags",
  paymentterms: "paymentTerms",
  paymenttermsdays: "paymentTerms",
  netdays: "paymentTerms",
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parses a clients CSV (first record = header). Per-row failures are collected
 * as errors with their 1-based line number; valid rows still import so one bad
 * row doesn't sink a 300-row file.
 */
export function parseClientsCsv(text: string): ParseClientsCsvResult {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "File is empty" }] };
  }

  const headers = records[0].map(normalizeHeader);
  const columns = headers.map((h) => HEADER_ALIASES[h]);
  if (!columns.includes("name")) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Missing required "name" column in the header row' }],
    };
  }

  const rows: ParsedClientRow[] = [];
  const errors: CsvRowError[] = [];

  for (let r = 1; r < records.length; r++) {
    const line = r + 1;
    if (rows.length >= MAX_IMPORT_ROWS) {
      errors.push({
        line,
        message: `Import is capped at ${MAX_IMPORT_ROWS} rows — split the file and run again`,
      });
      break;
    }

    const record = records[r];
    const row: ParsedClientRow = { name: "", tags: [] };
    for (let c = 0; c < columns.length; c++) {
      const key = columns[c];
      if (!key) continue;
      const value = (record[c] ?? "").trim();
      if (!value) continue;
      if (key === "tags") {
        row.tags = normalizeTags(value.split(/[;|]/));
      } else if (key === "paymentTerms") {
        const days = parseInt(value.replace(/^net\s*/i, ""), 10);
        if (Number.isInteger(days) && days >= 0 && days <= 365) {
          row.defaultPaymentTermsDays = days;
        } else {
          errors.push({ line, message: `Invalid payment terms "${value}"` });
        }
      } else {
        row[key] = value.slice(0, key === "notes" ? 2000 : 255);
      }
    }

    if (!row.name) {
      errors.push({ line, message: "Missing name" });
      continue;
    }
    if (row.email && !EMAIL_RE.test(row.email)) {
      errors.push({ line, message: `Invalid email "${row.email}" — imported without email` });
      delete row.email;
    }
    if (row.taxId) row.taxId = row.taxId.slice(0, 64);
    rows.push(row);
  }

  return { rows, errors };
}

import type { Form1099Pack, Contractor1099Row } from "./contractor-1099";

// Prefix-guard against CSV/spreadsheet formula injection (=, +, -, @, tab, CR).
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function esc(value: string | number | null | undefined): string {
  if (value == null) return "";
  let str = String(value);
  if (FORMULA_PREFIX.test(str)) str = `'${str}`;
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function money(n: number): string {
  return n.toFixed(2);
}

function statusLabel(r: Contractor1099Row): string {
  if (r.exempt) return "Exempt";
  if (!r.meetsThreshold) return "Below threshold";
  if (r.missingW9) return "Eligible — W-9 missing";
  return "Eligible";
}

/**
 * Year-end 1099 summary: one row per contractor with a reportable total,
 * flagged so the filer can see at a glance who needs a 1099-NEC and who is
 * still missing a W-9.
 */
export function pack1099ToCsv(pack: Form1099Pack): string {
  const header = [
    "Legal Name",
    "Business Name",
    "Tax Classification",
    "TIN Type",
    "TIN (Last 4)",
    `Box 1 Nonemployee Comp (${pack.year})`,
    "Payments",
    "W-9 On File",
    "Status",
    "Address",
    "City",
    "State",
    "ZIP",
  ].join(",");

  const lines = pack.rows.map((r) =>
    [
      esc(r.legalName),
      esc(r.businessName),
      esc(r.taxClassification),
      esc(r.tinType),
      esc(r.tinMasked),
      money(r.total),
      r.paymentCount,
      r.w9OnFile ? "Yes" : "No",
      esc(statusLabel(r)),
      esc(r.addressLine1),
      esc(r.city),
      esc(r.state),
      esc(r.zip),
    ].join(","),
  );

  const eligibleTotal = pack.rows
    .filter((r) => r.eligible)
    .reduce((sum, r) => sum + r.total, 0);
  lines.push(
    ["Total (eligible)", "", "", "", "", money(eligibleTotal), "", "", "", "", "", "", ""].join(","),
  );

  return [header, ...lines].join("\n");
}

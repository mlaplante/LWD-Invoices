import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { NextResponse } from "next/server";
import {
  getProfitAndLoss,
  getExpenseLedger,
  getPaymentLedger,
  getTaxLiability,
  getArAgingSnapshot,
} from "@/server/services/year-end-reports";
import {
  plToCsv,
  expensesToCsv,
  paymentsToCsv,
  taxToCsv,
  agingToCsv,
} from "@/server/services/year-end-csv";
import {
  renderPLPdf,
  renderExpensePdf,
  renderPaymentPdf,
  renderTaxPdf,
  renderAgingPdf,
} from "@/server/services/year-end-pdf";
import { buildYearEndZip } from "@/server/services/year-end-export-job";

const VALID_FORMATS = ["csv", "pdf", "zip"] as const;
const VALID_REPORTS = ["pl", "expenses", "payments", "tax", "aging"] as const;

// Download filename stem per report (defaults to the report key).
const REPORT_FILE_STEMS: Record<Report, string> = {
  pl: "pl",
  expenses: "expenses",
  payments: "payments",
  tax: "tax-liability",
  aging: "ar-aging",
};

type Format = (typeof VALID_FORMATS)[number];
type Report = (typeof VALID_REPORTS)[number];

export async function GET(request: Request) {
  // 1. Auth
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  // 2. Parse & validate params
  const { searchParams } = new URL(request.url);
  const yearStr = searchParams.get("year");
  const formatParam = searchParams.get("format") ?? "zip";
  const format: Format | undefined = VALID_FORMATS.find((f) => f === formatParam);
  const reportParam = searchParams.get("report");
  // Resolve against the whitelist so downstream lookups use the trusted
  // constant, never the raw query-string value.
  const report: Report | null =
    VALID_REPORTS.find((r) => r === reportParam) ?? null;

  if (!yearStr) {
    return NextResponse.json(
      { error: "year parameter is required" },
      { status: 400 },
    );
  }

  const year = parseInt(yearStr, 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: "year must be an integer between 2000 and 2100" },
      { status: 400 },
    );
  }

  if (!format) {
    return NextResponse.json(
      { error: `format must be one of: ${VALID_FORMATS.join(", ")}` },
      { status: 400 },
    );
  }

  if ((format === "csv" || format === "pdf") && !report) {
    return NextResponse.json(
      { error: "report parameter is required for csv/pdf format" },
      { status: 400 },
    );
  }

  if (reportParam !== null && !report) {
    return NextResponse.json(
      { error: `report must be one of: ${VALID_REPORTS.join(", ")}` },
      { status: 400 },
    );
  }

  // 3. Fetch data
  const fetchMap = {
    pl: () => getProfitAndLoss(db, orgId, year),
    expenses: () => getExpenseLedger(db, orgId, year),
    payments: () => getPaymentLedger(db, orgId, year),
    tax: () => getTaxLiability(db, orgId, year),
    aging: () => getArAgingSnapshot(db, orgId, year),
  };

  if (format === "csv" && report) {
    const data = await fetchMap[report]();
    const csvMap = { pl: plToCsv, expenses: expensesToCsv, payments: paymentsToCsv, tax: taxToCsv, aging: agingToCsv };
    const csv = csvMap[report](data as never);
    const filename = `${REPORT_FILE_STEMS[report]}-${year}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === "pdf" && report) {
    const data = await fetchMap[report]();
    const pdfMap = { pl: renderPLPdf, expenses: renderExpensePdf, payments: renderPaymentPdf, tax: renderTaxPdf, aging: renderAgingPdf };
    const pdfBuffer = await pdfMap[report](data as never, year);
    const filename = `${REPORT_FILE_STEMS[report]}-${year}.pdf`;

    return new Response(new Uint8Array(pdfBuffer) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // format === "zip" — synchronous fallback (small orgs / direct links). The
  // year-end page uses the background job at /api/reports/year-end/jobs so
  // large exports don't race the serverless timeout.
  const zipBuffer = await buildYearEndZip(db, orgId, year);

  return new Response(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="year-end-${year}.zip"`,
    },
  });
}

import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { NextResponse } from "next/server";
import {
  getProfitAndLoss,
  getExpenseLedger,
  getPaymentLedger,
  getTaxLiability,
} from "@/server/services/year-end-reports";
import {
  plToCsv,
  expensesToCsv,
  paymentsToCsv,
  taxToCsv,
} from "@/server/services/year-end-csv";
import {
  renderPLPdf,
  renderExpensePdf,
  renderPaymentPdf,
  renderTaxPdf,
} from "@/server/services/year-end-pdf";

const VALID_FORMATS = ["csv", "pdf", "zip"] as const;
const VALID_REPORTS = ["pl", "expenses", "payments", "tax"] as const;

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
  const format = (searchParams.get("format") ?? "zip") as Format;
  const report = searchParams.get("report") as Report | null;

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

  if (!VALID_FORMATS.includes(format)) {
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

  if (report && !VALID_REPORTS.includes(report)) {
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
  };

  if (format === "csv" && report) {
    const data = await fetchMap[report]();
    const csvMap = { pl: plToCsv, expenses: expensesToCsv, payments: paymentsToCsv, tax: taxToCsv };
    const csv = csvMap[report](data as never);
    const filename = `${report === "tax" ? "tax-liability" : report}-${year}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === "pdf" && report) {
    const data = await fetchMap[report]();
    const pdfMap = { pl: renderPLPdf, expenses: renderExpensePdf, payments: renderPaymentPdf, tax: renderTaxPdf };
    const pdfBuffer = await pdfMap[report](data as never, year);
    const filename = `${report === "tax" ? "tax-liability" : report}-${year}.pdf`;

    return new Response(new Uint8Array(pdfBuffer) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // format === "zip" — bundle all 4 CSVs + 4 PDFs
  const JSZip = (await import("jszip")).default;
  const [plData, expensesData, paymentsData, taxData] = await Promise.all([
    fetchMap.pl(),
    fetchMap.expenses(),
    fetchMap.payments(),
    fetchMap.tax(),
  ]);

  const [plPdf, expensesPdf, paymentsPdf, taxPdf] = await Promise.all([
    renderPLPdf(plData as never, year),
    renderExpensePdf(expensesData as never, year),
    renderPaymentPdf(paymentsData as never, year),
    renderTaxPdf(taxData as never, year),
  ]);

  const zip = new JSZip();
  zip.file(`pl-${year}.csv`, plToCsv(plData as never));
  zip.file(`pl-${year}.pdf`, plPdf);
  zip.file(`expenses-${year}.csv`, expensesToCsv(expensesData as never));
  zip.file(`expenses-${year}.pdf`, expensesPdf);
  zip.file(`payments-${year}.csv`, paymentsToCsv(paymentsData as never));
  zip.file(`payments-${year}.pdf`, paymentsPdf);
  zip.file(`tax-liability-${year}.csv`, taxToCsv(taxData as never));
  zip.file(`tax-liability-${year}.pdf`, taxPdf);

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });

  return new Response(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="year-end-${year}.zip"`,
    },
  });
}

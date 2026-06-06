import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { NextResponse } from "next/server";
import { get1099Pack } from "@/server/services/contractor-1099";
import { pack1099ToCsv } from "@/server/services/contractor-1099-csv";
import {
  render1099SummaryPdf,
  render1099FormsPdf,
} from "@/server/services/contractor-1099-pdf";

const VALID_FORMATS = ["csv", "summary-pdf", "forms-pdf", "zip"] as const;
type Format = (typeof VALID_FORMATS)[number];

export async function GET(request: Request) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  const { searchParams } = new URL(request.url);
  const yearStr = searchParams.get("year");
  const format = (searchParams.get("format") ?? "zip") as Format;

  if (!yearStr) {
    return NextResponse.json({ error: "year parameter is required" }, { status: 400 });
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

  const pack = await get1099Pack(db, orgId, year);

  if (format === "csv") {
    return new Response(pack1099ToCsv(pack), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="1099-summary-${year}.csv"`,
      },
    });
  }

  if (format === "summary-pdf") {
    const pdf = await render1099SummaryPdf(pack);
    return new Response(new Uint8Array(pdf) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="1099-summary-${year}.pdf"`,
      },
    });
  }

  if (format === "forms-pdf") {
    const pdf = await render1099FormsPdf(pack);
    return new Response(new Uint8Array(pdf) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="1099-nec-forms-${year}.pdf"`,
      },
    });
  }

  // format === "zip" — summary CSV + summary PDF + per-contractor forms PDF
  const JSZip = (await import("jszip")).default;
  const [summaryPdf, formsPdf] = await Promise.all([
    render1099SummaryPdf(pack),
    render1099FormsPdf(pack),
  ]);

  const zip = new JSZip();
  zip.file(`1099-summary-${year}.csv`, pack1099ToCsv(pack));
  zip.file(`1099-summary-${year}.pdf`, summaryPdf);
  zip.file(`1099-nec-forms-${year}.pdf`, formsPdf);

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  return new Response(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="1099-pack-${year}.zip"`,
    },
  });
}

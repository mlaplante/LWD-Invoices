import { db } from "@/server/db";
import { NextResponse } from "next/server";
import { get1099Pack } from "@/server/services/contractor-1099";
import { render1099FormsPdf } from "@/server/services/contractor-1099-pdf";
import { safeErrorResponse } from "@/lib/api-errors";

/**
 * Download a single contractor's 1099-NEC form from the portal.
 * Token-authenticated: the portalToken resolves the contractor, access is gated
 * on portalEnabled, and the org 1099 pack is filtered to just this contractor's
 * row before rendering — so a contractor can only ever see their own form.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const yearParam = new URL(req.url).searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : NaN;
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const contractor = await db.contractor.findUnique({
      where: { portalToken: token },
      select: { id: true, organizationId: true, portalEnabled: true, isArchived: true, legalName: true },
    });
    if (!contractor || !contractor.portalEnabled || contractor.isArchived) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const pack = await get1099Pack(db, contractor.organizationId, year);
    const row = pack.rows.find((r) => r.contractorId === contractor.id);
    if (!row || !row.eligible) {
      return NextResponse.json(
        { error: "No 1099-NEC is available for this year." },
        { status: 404 },
      );
    }

    // Render only this contractor's form by filtering the pack to their row.
    const pdf = await render1099FormsPdf({ ...pack, rows: [row] });
    const safeName = contractor.legalName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="1099-NEC-${year}-${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    // PDF/1099 rendering errors can carry file paths and library internals;
    // don't echo them to an unauthenticated token holder.
    return safeErrorResponse("Failed to generate 1099", 500, {
      route: "contractor-portal/[token]/1099",
      cause: err,
    });
  }
}

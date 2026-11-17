import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth } from "../../auth";
import { jsonWithETag } from "../../etag";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withV1Auth(req, async ({ orgId }) => {
    const { id } = await params;
    const invoice = await db.invoice.findFirst({
      where: { id, organizationId: orgId },
      include: {
        // Explicit select: the full Client row carries portalToken,
        // portalPassphraseHash, the reset-token hash, emailPreferencesToken
        // and stripeCustomerId — credentials that must never leave the server.
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            country: true,
            taxId: true,
          },
        },
        currency: true,
        lines: { include: { taxes: { include: { tax: true } } } },
        payments: true,
        partialPayments: true,
      },
    });

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return jsonWithETag(req, { data: invoice });
  });
}

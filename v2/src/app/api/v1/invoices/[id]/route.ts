import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth } from "../../auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withV1Auth(req, async ({ orgId }) => {
    const { id } = await params;
    const org = await db.organization.findFirst({ where: { clerkId: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const invoice = await db.invoice.findFirst({
      where: { id, organizationId: org.id },
      include: {
        client: true,
        currency: true,
        lines: { include: { taxes: { include: { tax: true } } } },
        payments: true,
        partialPayments: true,
      },
    });

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: invoice });
  });
}

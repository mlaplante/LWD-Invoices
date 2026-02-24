import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { InvoiceStatus } from "@/generated/prisma";
import { withV1Auth, paginationParams } from "../auth";

export async function GET(req: NextRequest) {
  return withV1Auth(req, async ({ orgId }) => {
    const org = await db.organization.findFirst({ where: { clerkId: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { skip, take, page } = paginationParams(req);
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam && Object.values(InvoiceStatus).includes(statusParam as InvoiceStatus)
        ? (statusParam as InvoiceStatus)
        : null;
    if (statusParam && !status) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const invoices = await db.invoice.findMany({
      where: {
        organizationId: org.id,
        ...(status ? { status } : {}),
        isArchived: false,
      },
      include: { client: { select: { id: true, name: true, email: true } }, currency: true },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: invoices, page });
  });
}

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
    const client = await db.client.findFirst({
      where: { id, organizationId: orgId },
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
        notes: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
        organizationId: true,
        invoices: {
          select: { id: true, number: true, status: true, total: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return jsonWithETag(req, { data: client });
  });
}

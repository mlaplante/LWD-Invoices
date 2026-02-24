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

    const client = await db.client.findFirst({
      where: { id, organizationId: org.id },
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
    return NextResponse.json({ data: client });
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth, paginationParams } from "../auth";
import { jsonWithETag } from "../etag";

export async function GET(req: NextRequest) {
  return withV1Auth(req, async ({ orgId }) => {
    const { skip, take, page } = paginationParams(req);
    const clients = await db.client.findMany({
      where: { organizationId: orgId, isArchived: false },
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
      },
      skip,
      take,
      orderBy: { name: "asc" },
    });

    return jsonWithETag(req, { data: clients, page });
  });
}

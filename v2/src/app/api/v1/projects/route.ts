import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth, paginationParams } from "../auth";

export async function GET(req: NextRequest) {
  return withV1Auth(req, async ({ orgId }) => {
    const org = await db.organization.findFirst({ where: { clerkId: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { skip, take, page } = paginationParams(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const projects = await db.project.findMany({
      where: {
        organizationId: org.id,
        ...(status ? { status: status as never } : {}),
      },
      include: { client: { select: { id: true, name: true } } },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: projects, page });
  });
}

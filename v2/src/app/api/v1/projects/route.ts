import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { ProjectStatus } from "@/generated/prisma";
import { withV1Auth, paginationParams } from "../auth";

export async function GET(req: NextRequest) {
  return withV1Auth(req, async ({ orgId }) => {
    const org = await db.organization.findFirst({ where: { clerkId: orgId } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { skip, take, page } = paginationParams(req);
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam && Object.values(ProjectStatus).includes(statusParam as ProjectStatus)
        ? (statusParam as ProjectStatus)
        : null;
    if (statusParam && !status) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const projects = await db.project.findMany({
      where: {
        organizationId: org.id,
        ...(status ? { status } : {}),
      },
      include: { client: { select: { id: true, name: true } } },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: projects, page });
  });
}

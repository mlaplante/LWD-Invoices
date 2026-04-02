import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { withV1Auth } from "../../auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withV1Auth(req, async ({ orgId }) => {
    const { id } = await params;
    const project = await db.project.findFirst({
      where: { id, organizationId: orgId },
      include: {
        client: { select: { id: true, name: true } },
        tasks: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: project });
  });
}

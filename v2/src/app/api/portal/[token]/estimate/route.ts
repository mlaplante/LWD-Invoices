import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = (await req.json()) as { action: "accept" | "decline" };

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
  });
  if (!invoice || invoice.type !== "ESTIMATE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const newStatus = body.action === "accept" ? "ACCEPTED" : "REJECTED";
  await db.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });
  return NextResponse.json({ status: newStatus });
}

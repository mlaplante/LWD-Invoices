import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { notifyOrgAdmins } from "@/server/services/notifications";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = (await req.json()) as { action: "accept" | "decline" };

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: { id: true, number: true, type: true, status: true, organizationId: true, portalPassphraseHash: true },
  });
  if (!invoice || invoice.type !== "ESTIMATE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verify portal auth cookie (set by /api/portal/[token]/auth)
  if (invoice.portalPassphraseHash) {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(`portal_auth_${token}`);
    if (!authCookie || authCookie.value !== invoice.portalPassphraseHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (invoice.status === "ACCEPTED" || invoice.status === "REJECTED") {
    return NextResponse.json({ error: "Estimate already finalised" }, { status: 409 });
  }

  const newStatus = body.action === "accept" ? "ACCEPTED" : "REJECTED";
  await db.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });

  await notifyOrgAdmins(invoice.organizationId, {
    type: newStatus === "ACCEPTED" ? "ESTIMATE_ACCEPTED" : "ESTIMATE_REJECTED",
    title: `Estimate ${newStatus === "ACCEPTED" ? "accepted" : "rejected"}`,
    body: `Client has ${newStatus === "ACCEPTED" ? "accepted" : "rejected"} estimate #${invoice.number}`,
    link: `/invoices/${invoice.id}`,
  });

  return NextResponse.json({ status: newStatus });
}

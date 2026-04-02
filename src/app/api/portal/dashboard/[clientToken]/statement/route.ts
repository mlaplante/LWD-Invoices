import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { isSessionExpired } from "@/server/services/portal-dashboard";
import { cookies } from "next/headers";
import {
  generateClientStatementPDF,
  type StatementData,
  type StatementInvoice,
} from "@/server/services/client-statement-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> }
) {
  const { clientToken } = await params;

  // Verify session cookie
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(
    `portal_dashboard_${clientToken}`
  )?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await db.clientPortalSession.findUnique({
    where: { token: sessionToken },
    select: { expiresAt: true, clientId: true },
  });

  if (!session || isSessionExpired(session.expiresAt)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch client with organization
  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    include: {
      organization: true,
    },
  });

  if (!client || client.id !== session.clientId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch invoices with payments
  const invoices = await db.invoice.findMany({
    where: {
      clientId: client.id,
      status: { notIn: ["DRAFT"] },
    },
    include: {
      currency: true,
      payments: { select: { amount: true } },
    },
    orderBy: { date: "desc" },
  });

  const statementInvoices: StatementInvoice[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    type: inv.type,
    status: inv.status,
    date: inv.date,
    dueDate: inv.dueDate,
    total: inv.total,
    currency: inv.currency,
    amountPaid: inv.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    ),
  }));

  const pdf = await generateClientStatementPDF({
    client,
    organization: client.organization as StatementData["organization"],
    invoices: statementInvoices,
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${client.name.replace(/[^a-zA-Z0-9]/g, "-")}.pdf"`,
    },
  });
}

import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { NextResponse } from "next/server";
import type { StatementData } from "@/server/services/client-statement-pdf";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await getAuthenticatedOrg();
    if (isAuthError(auth)) return auth;
    const { orgId } = auth;

    const { id: clientId } = await params;
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

    // Verify client belongs to this org
    const client = await db.client.findUnique({
      where: { id: clientId, organizationId: orgId },
    });
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const organization = await db.organization.findUnique({ where: { id: orgId } });
    if (!organization) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Fetch invoices with payments
    const invoices = await db.invoice.findMany({
      where: {
        clientId,
        organizationId: orgId,
        isArchived: false,
        ...(from || to ? {
          date: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        } : {}),
      },
      include: {
        currency: true,
        payments: { select: { amount: true } },
        partialPayments: { select: { amount: true } },
      },
      orderBy: { date: "asc" },
    });

    const statementInvoices: StatementData["invoices"] = invoices.map((inv) => {
      const amountPaid =
        inv.payments.reduce((s, p) => s + Number(p.amount), 0) +
        inv.partialPayments.reduce((s, p) => s + Number(p.amount), 0);
      return {
        id: inv.id,
        number: inv.number,
        type: inv.type,
        status: inv.status,
        date: inv.date,
        dueDate: inv.dueDate,
        total: inv.total,
        currency: inv.currency,
        amountPaid,
      };
    });

    const { generateClientStatementPDF } = await import(
      "@/server/services/client-statement-pdf"
    );

    const pdf = await generateClientStatementPDF({
      client,
      organization,
      invoices: statementInvoices,
      from,
      to,
    });

    const safeName = client.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const date = new Date().toISOString().split("T")[0];

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="statement-${safeName}-${date}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[client statement]", err);
    const message = err instanceof Error ? err.message : "Failed to generate statement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

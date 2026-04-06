import { db } from "@/server/db";
import { isSessionExpired } from "@/server/services/portal-dashboard";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { DashboardSummaryCards } from "@/components/portal/DashboardSummaryCards";
import { DashboardInvoiceTable } from "@/components/portal/DashboardInvoiceTable";
import { DashboardPaymentHistory } from "@/components/portal/DashboardPaymentHistory";
import { DashboardProjects } from "@/components/portal/DashboardProjects";
import { SavedCards } from "@/components/portal/SavedCards";
import { formatCurrency } from "@/lib/format";

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ clientToken: string }>;
}) {
  const { clientToken } = await params;

  // Verify session (same pattern as layout)
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(
    `portal_dashboard_${clientToken}`
  )?.value;

  if (!sessionToken) {
    redirect(`/portal/dashboard/${clientToken}/login`);
  }

  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
  });

  if (!client) redirect("/");

  const session = await db.clientPortalSession.findUnique({
    where: { token: sessionToken },
    select: { expiresAt: true, clientId: true },
  });

  if (
    !session ||
    session.clientId !== client.id ||
    isSessionExpired(session.expiresAt)
  ) {
    redirect(`/portal/dashboard/${clientToken}/login`);
  }

  // Fetch invoices (exclude drafts)
  const invoices = await db.invoice.findMany({
    where: {
      clientId: client.id,
      status: { notIn: ["DRAFT"] },
    },
    include: {
      currency: true,
      payments: { select: { amount: true, method: true, paidAt: true, id: true } },
    },
    orderBy: { date: "desc" },
  });

  // Fetch active projects viewable by client
  const projects = await db.project.findMany({
    where: {
      clientId: client.id,
      status: "ACTIVE",
      isViewable: true,
    },
    select: {
      id: true,
      name: true,
      status: true,
      dueDate: true,
      projectedHours: true,
    },
    orderBy: { dueDate: "asc" },
  });

  // Derive currency from first invoice (all client invoices typically share currency)
  const firstCurrency = invoices[0]?.currency;
  const sym = firstCurrency?.symbol ?? "$";
  const pos = firstCurrency?.symbolPosition ?? "before";

  // Compute summaries
  let outstandingTotal = 0;
  let overdueTotal = 0;

  const invoiceRows = invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(inv.total) - paid;

    if (["SENT", "PARTIALLY_PAID"].includes(inv.status) && balance > 0) {
      outstandingTotal += balance;
    }
    if (inv.status === "OVERDUE" && balance > 0) {
      outstandingTotal += balance;
      overdueTotal += balance;
    }

    return {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      date: inv.date.toISOString(),
      dueDate: inv.dueDate?.toISOString() ?? null,
      total: Number(inv.total).toFixed(2),
      amountPaid: paid.toFixed(2),
      portalToken: inv.portalToken,
      currency: {
        symbol: inv.currency.symbol,
        symbolPosition: inv.currency.symbolPosition,
      },
    };
  });

  // Gather recent payments across all invoices (last 10)
  const allPayments = invoices
    .flatMap((inv) =>
      inv.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount).toFixed(2),
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        invoiceNumber: inv.number,
        currencySymbol: sym,
      }))
    )
    .sort(
      (a, b) =>
        new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
    )
    .slice(0, 10);

  const projectRows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    dueDate: p.dueDate?.toISOString() ?? null,
    projectedHours: p.projectedHours,
  }));

  return (
    <div className="space-y-6">
      {/* Welcome header + download */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome, {client.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your invoices and account overview
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/portal/dashboard/${clientToken}/statement`}
            download
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download Statement
          </a>
        </Button>
      </div>

      {/* Summary cards */}
      <DashboardSummaryCards
        outstanding={formatCurrency(outstandingTotal, sym, pos)}
        overdue={formatCurrency(overdueTotal, sym, pos)}
        totalInvoices={invoices.length}
        currencySymbol={sym}
      />

      {/* Invoice table */}
      <DashboardInvoiceTable invoices={invoiceRows} />

      {/* Two-column: payments + projects */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DashboardPaymentHistory payments={allPayments} />
        <DashboardProjects projects={projectRows} />
      </div>

      {/* Saved payment methods */}
      <SavedCards clientToken={clientToken} />
    </div>
  );
}

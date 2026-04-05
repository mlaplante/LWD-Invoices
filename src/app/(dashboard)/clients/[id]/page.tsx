import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/clients/ClientForm";
import { ArchiveClientButton } from "@/components/clients/ArchiveClientButton";
import { ClientStatementButton } from "@/components/clients/ClientStatementButton";
import { RetainerPanel } from "@/components/clients/RetainerPanel";
import { AutoChargeBadge } from "@/components/clients/AutoChargeBadge";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { ArrowLeft, ExternalLink, FileText, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { getClientOnTimePercent } from "@/server/services/client-payment-score";
import { db } from "@/server/db";

// ── Shared status badge config ───────────────────────────────────────────────

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT:         { label: "Draft",    className: "bg-gray-100 text-gray-500" },
  SENT:          { label: "Unpaid",   className: "bg-amber-50 text-amber-600" },
  PARTIALLY_PAID:{ label: "Partial",  className: "bg-blue-50 text-blue-600" },
  PAID:          { label: "Paid",     className: "bg-primary/10 text-primary" },
  OVERDUE:       { label: "Overdue",  className: "bg-red-50 text-red-600" },
  ACCEPTED:      { label: "Accepted", className: "bg-emerald-50 text-emerald-600" },
  REJECTED:      { label: "Rejected", className: "bg-gray-100 text-gray-400" },
};

const TYPE_LABEL: Record<InvoiceType, string> = {
  DETAILED:    "Invoice",
  SIMPLE:      "Invoice",
  ESTIMATE:    "Estimate",
  CREDIT_NOTE: "Credit Note",
  DEPOSIT:     "Deposit",
};

// Generate initials + consistent color
function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
];

function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// ── Page ─────────────────────────────────────────────────────────────────────

type InvoiceFilter = "all" | "unpaid" | "paid";

const INVOICE_FILTER_TABS: { id: InvoiceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "paid", label: "Paid" },
];

const INVOICE_FILTER_STATUSES: Record<InvoiceFilter, InvoiceStatus[] | undefined> = {
  all: undefined,
  unpaid: ["SENT", "OVERDUE", "PARTIALLY_PAID"],
  paid: ["PAID"],
};

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const [{ id }, { filter: rawFilter }] = await Promise.all([
    params,
    searchParams,
  ]);

  const activeFilter: InvoiceFilter =
    rawFilter === "unpaid" || rawFilter === "paid" ? rawFilter : "all";

  let client;
  try {
    client = await api.clients.get({ id });
  } catch {
    notFound();
  }

  const [{ items: allInvoices }, onTimePercent, org] = await Promise.all([
    api.invoices.list({ clientId: id, includeArchived: false, pageSize: 100 }),
    getClientOnTimePercent(db, id),
    api.organization.get(),
  ]);
  const isReliable = org.smartRemindersEnabled &&
    onTimePercent !== null &&
    onTimePercent >= org.smartRemindersThreshold;

  // Outstanding balance = sum of unpaid invoices
  const unpaidInvoices = allInvoices.filter((inv) =>
    ["SENT", "OVERDUE", "PARTIALLY_PAID"].includes(inv.status)
  );
  const outstandingBalance = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const balanceCurrency = unpaidInvoices[0]?.currency;

  const statusFilter = INVOICE_FILTER_STATUSES[activeFilter];
  const invoices = statusFilter
    ? allInvoices.filter((inv) => statusFilter.includes(inv.status))
    : allInvoices;

  // Build portal link from request headers (avoids hardcoded NEXT_PUBLIC_APP_URL)
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto =
    headersList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const portalLink = `${proto}://${host}/portal/dashboard/${client.portalToken}`;

  const color = avatarColor(client.name);

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/clients"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Clients
          </Link>
          <span className="text-border/70">/</span>
          <h1 className="text-xl font-bold tracking-tight truncate">
            {client.name}
          </h1>
          {isReliable && (
            <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shrink-0">
              Reliable payer
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 lg:flex-wrap lg:overflow-visible">
          <Button asChild size="sm">
            <Link href={`/invoices/new?clientId=${client.id}`}>
              <Receipt className="w-3.5 h-3.5 mr-1.5" />
              New Invoice
            </Link>
          </Button>
          <ClientStatementButton clientId={client.id} />
          <Button asChild variant="outline" size="sm">
            <a href={portalLink} target="_blank" rel="noreferrer">
              Portal
              <ExternalLink className="w-3 h-3 ml-1.5" />
            </a>
          </Button>
          <ArchiveClientButton clientId={client.id} isArchived={client.isArchived} />
        </div>
      </div>

      {/* ── Client profile banner ─────────────────────────────────── */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        {/* Banner */}
        <div className="px-8 pt-7 pb-6 border-b border-border/50 flex items-start gap-5">
          <div
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-extrabold shrink-0",
              color
            )}
          >
            {initials(client.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-extrabold tracking-tight leading-tight">
              {client.name}
            </p>
            {client.email && (
              <p className="text-sm text-muted-foreground mt-0.5">{client.email}</p>
            )}
            <div className="mt-2">
              <AutoChargeBadge
                clientId={client.id}
                stripeCustomerId={client.stripeCustomerId}
                autoChargeEnabled={client.autoChargeEnabled}
              />
            </div>
          </div>

          {/* Quick contact grid */}
          {(client.phone || client.city || client.country || client.taxId) && (
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm self-start shrink-0">
              {client.phone && (
                <>
                  <span className="text-muted-foreground">Phone</span>
                  <span>{client.phone}</span>
                </>
              )}
              {(client.city || client.country) && (
                <>
                  <span className="text-muted-foreground">Location</span>
                  <span>
                    {[client.city, client.state, client.country]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </>
              )}
              {client.taxId && (
                <>
                  <span className="text-muted-foreground">Tax ID</span>
                  <span className="font-mono text-xs">{client.taxId}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Edit form */}
        <div className="px-8 py-6">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">
            Edit Details
          </p>
          <ClientForm mode="edit" client={client} />
        </div>
      </div>

      {/* ── Retainer ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <RetainerPanel clientId={id} />
      </div>

      {/* ── Invoices ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Invoices</h2>
          {outstandingBalance > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">Outstanding: </span>
              <span className="font-semibold text-amber-600">
                {balanceCurrency?.symbolPosition === "after"
                  ? `${outstandingBalance.toFixed(2)}${balanceCurrency.symbol}`
                  : `${balanceCurrency?.symbol ?? "$"}${outstandingBalance.toFixed(2)}`}
              </span>
            </div>
          )}
        </div>

        {/* Status filter tabs */}
        {allInvoices.length > 0 && (
          <div className="flex items-center gap-1 border-b border-border">
            {INVOICE_FILTER_TABS.map((t) => (
              <Link
                key={t.id}
                href={t.id === "all" ? `/clients/${id}` : `/clients/${id}?filter=${t.id}`}
                className={cn(
                  "px-3 py-2 text-sm font-medium transition-colors relative",
                  activeFilter === t.id
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {activeFilter === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </Link>
            ))}
          </div>
        )}

        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-border/50 border-dashed text-center">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center mb-3">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              {activeFilter === "all"
                ? "No invoices for this client yet."
                : `No ${activeFilter} invoices.`}
            </p>
            {activeFilter === "all" && (
              <Button asChild size="sm" className="mt-3">
                <Link href={`/invoices/new?clientId=${client.id}`}>
                  Create Invoice
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {["Invoice", "Date", "Due", "Status", "Total", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className={cn(
                          "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                          i >= 4 ? "text-right" : "text-left"
                        )}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {invoices.map((inv) => {
                  const badge = STATUS_BADGE[inv.status];
                  return (
                    <tr
                      key={inv.id}
                      className="group hover:bg-accent/20 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-semibold hover:text-primary transition-colors"
                        >
                          {TYPE_LABEL[inv.type]} #{inv.number}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {formatDate(inv.date)}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {formatDate(inv.dueDate)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold">
                        {inv.currency.symbol}
                        {Number(inv.total).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-primary hover:bg-primary hover:text-primary-foreground transition-colors opacity-0 group-hover:opacity-100"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

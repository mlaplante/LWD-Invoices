import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoiceTableWithBulk } from "@/components/invoices/InvoiceTableWithBulk";
import { SearchInput } from "@/components/ui/SearchInput";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Suspense } from "react";

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  InvoiceStatus,
  { label: string; className: string; dot: string }
> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",       dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",      dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",        dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600",  dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",          dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",      dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",       dot: "bg-gray-300" },
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  DETAILED: "Invoice",
  SIMPLE: "Invoice",
  ESTIMATE: "Estimate",
  CREDIT_NOTE: "Credit Note",
};

function fmt(
  n: number | { toNumber(): number },
  symbol: string,
  pos: string
): string {
  const val = typeof n === "object" ? n.toNumber() : n;
  return pos === "before"
    ? `${symbol}${val.toFixed(2)}`
    : `${val.toFixed(2)}${symbol}`;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Tab config ───────────────────────────────────────────────────────────────

type Tab = "all" | "unpaid" | "pending" | "paid" | "archived";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Invoices" },
  { id: "unpaid", label: "Unpaid" },
  { id: "pending", label: "Pending" },
  { id: "paid", label: "Paid" },
  { id: "archived", label: "Archived" },
];

const TAB_FILTERS: Record<
  Tab,
  { status?: InvoiceStatus[]; includeArchived: boolean }
> = {
  all: { includeArchived: false },
  unpaid: { status: ["SENT", "OVERDUE"], includeArchived: false },
  pending: { status: ["DRAFT", "PARTIALLY_PAID"], includeArchived: false },
  paid: { status: ["PAID", "ACCEPTED"], includeArchived: false },
  archived: { includeArchived: true },
};

// ── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; search?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const { tab: rawTab, page: rawPage, search, dateFrom, dateTo } = await searchParams;
  const activeTab: Tab =
    rawTab && Object.keys(TAB_FILTERS).includes(rawTab)
      ? (rawTab as Tab)
      : "all";
  const page = Math.max(1, parseInt(rawPage ?? "1", 10));

  const filter = TAB_FILTERS[activeTab];

  let result: Awaited<ReturnType<typeof api.invoices.list>> = { items: [], total: 0 };
  try {
    result = await api.invoices.list({
      ...filter,
      search: search || undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    console.error("[InvoicesPage] list failed:", err);
    throw err;
  }

  const { items: paginatedInvoices, total } = result;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const start = (currentPage - 1) * PAGE_SIZE;

  // Build tab-aware page link
  const tabParam = activeTab !== "all" ? `tab=${activeTab}&` : "";
  const pageLink = (p: number) => `/invoices?${tabParam}page=${p}`;

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Suspense>
            <DateRangeFilter />
          </Suspense>
          <Suspense>
            <SearchInput placeholder="Search invoices…" />
          </Suspense>
          <Button asChild size="sm">
            <Link href="/invoices/new">+ New Invoice</Link>
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "all" ? "/invoices" : `/invoices?tab=${t.id}`}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative",
              activeTab === t.id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {activeTab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </Link>
        ))}
      </div>

      {/* Invoice table */}
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <p className="font-semibold text-foreground">No invoices yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first invoice to get started.
          </p>
          <Button asChild className="mt-5" size="sm">
            <Link href="/invoices/new">Create Invoice</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="sm:hidden divide-y divide-border/50">
            {paginatedInvoices.map((inv) => {
              const badge = STATUS_BADGE[inv.status];
              return (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="flex items-center gap-3 py-3.5 px-2 hover:bg-accent/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">
                      {TYPE_LABELS[inv.type]} #{inv.number}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {inv.client.name} · {formatDate(inv.date)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-semibold text-sm">
                      {fmt(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                    </span>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", badge.className)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.dot)} />
                      {badge.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop table with bulk actions */}
          <div className="hidden sm:block overflow-x-auto">
            <InvoiceTableWithBulk
              invoices={paginatedInvoices.map((inv) => ({
                id: inv.id,
                number: inv.number,
                status: inv.status,
                type: inv.type,
                date: inv.date ? inv.date.toISOString() : null,
                total: Number(inv.total),
                currency: inv.currency,
                client: { name: inv.client.name },
              }))}
            />
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/40 px-2 py-3 text-sm text-muted-foreground">
              <span>
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                {currentPage > 1 && (
                  <Link
                    href={pageLink(currentPage - 1)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                <span className="px-3 py-1.5 text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                {currentPage < totalPages && (
                  <Link
                    href={pageLink(currentPage + 1)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

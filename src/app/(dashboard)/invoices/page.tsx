import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus } from "@/generated/prisma";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoiceTableWithBulk } from "@/components/invoices/InvoiceTableWithBulk";
import { InvoiceMobileListWithBulk } from "@/components/invoices/InvoiceMobileListWithBulk";
import { SearchInput } from "@/components/ui/SearchInput";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Suspense } from "react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { InvoiceDatePresets } from "@/components/invoices/InvoiceDatePresets";

// ── Tab config ───────────────────────────────────────────────────────────────

type Tab = "all" | "unpaid" | "pending" | "paid" | "archived" | "recurring";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Invoices" },
  { id: "unpaid", label: "Unpaid" },
  { id: "pending", label: "Pending" },
  { id: "paid", label: "Paid" },
  { id: "recurring", label: "Recurring" },
  { id: "archived", label: "Archived" },
];

const TAB_FILTERS: Record<
  Tab,
  { status?: InvoiceStatus[]; includeArchived: boolean; recurring?: boolean }
> = {
  all: { includeArchived: false },
  unpaid: { status: ["SENT", "OVERDUE"], includeArchived: false },
  pending: { status: ["DRAFT", "PARTIALLY_PAID"], includeArchived: false },
  paid: { status: ["PAID", "ACCEPTED"], includeArchived: false },
  recurring: { includeArchived: false, recurring: true },
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

  // Build page link preserving all active filters
  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    if (activeTab !== "all") params.set("tab", activeTab);
    if (search) params.set("search", search);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("page", String(p));
    return `/invoices?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap print:hidden">
            <Suspense>
              <InvoiceDatePresets />
            </Suspense>
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
          <PrintReportButton />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border print:hidden">
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
          {/* Mobile card list with bulk selection */}
          <InvoiceMobileListWithBulk
            invoices={paginatedInvoices.map((inv) => ({
              id: inv.id,
              number: inv.number,
              status: inv.status,
              type: inv.type,
              date: inv.date ? inv.date.toISOString() : null,
              total: Number(inv.total),
              currency: inv.currency,
              client: { name: inv.client.name },
              recurringInvoice: inv.recurringInvoice
                ? { isActive: inv.recurringInvoice.isActive, frequency: inv.recurringInvoice.frequency }
                : null,
            }))}
          />

          {/* Desktop table with bulk actions */}
          <div className="hidden sm:block print:block overflow-x-auto">
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
                recurringInvoice: inv.recurringInvoice
                  ? {
                      isActive: inv.recurringInvoice.isActive,
                      frequency: inv.recurringInvoice.frequency,
                    }
                  : null,
              }))}
            />
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/40 px-2 py-3 text-sm text-muted-foreground print:hidden">
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

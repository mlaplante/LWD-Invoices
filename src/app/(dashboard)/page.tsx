import { api } from "@/trpc/server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import {
  FileText,
  Users,
  FolderOpen,
  AlertCircle,
  TrendingUp,
  Plus,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400" },
};

const TYPE_LABEL: Record<InvoiceType, string> = {
  DETAILED:    "Invoice",
  SIMPLE:      "Invoice",
  ESTIMATE:    "Estimate",
  CREDIT_NOTE: "Credit Note",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(total: number | { toNumber(): number }, symbol: string, pos: string) {
  const val = typeof total === "object" ? total.toNumber() : total;
  return pos === "before" ? `${symbol}${val.toFixed(2)}` : `${val.toFixed(2)}${symbol}`;
}

const FOLDER_COLORS = [
  "bg-violet-100 text-violet-600",
  "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-600",
  "bg-cyan-100 text-cyan-600",
  "bg-orange-100 text-orange-600",
  "bg-indigo-100 text-indigo-600",
];
function folderColor(name: string) {
  return FOLDER_COLORS[name.charCodeAt(0) % FOLDER_COLORS.length];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [invoices, clients, projects, overdueInvoices, recentlyViewed] = await Promise.all([
    api.invoices.list({ includeArchived: false, pageSize: 100 }),
    api.clients.list({ includeArchived: false }),
    api.projects.list({ includeArchived: false }),
    api.reports.overdueInvoices(),
    api.invoices.recentlyViewed({ limit: 5 }),
  ]);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const unpaidStatuses: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];
  const unpaidInvoices = invoices.items.filter((inv) => unpaidStatuses.includes(inv.status));
  const overdueCount = invoices.items.filter((inv) => inv.status === "OVERDUE").length;
  const activeProjects = projects.filter((p) => p.status === "ACTIVE");
  const recentInvoices = invoices.items.slice(0, 6);

  const today = new Date();
  const greeting = today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="space-y-5">

      {/* ── Greeting ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}{user?.user_metadata?.firstName ? `, ${user.user_metadata.firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateLabel}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/invoices/new">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Invoice
          </Link>
        </Button>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<FileText className="w-4 h-4" />}
          label="Unpaid Invoices"
          value={String(unpaidInvoices.length)}
          color="text-amber-600 bg-amber-50"
          href="/invoices"
        />
        <StatCard
          icon={<AlertCircle className="w-4 h-4" />}
          label="Overdue"
          value={String(overdueCount)}
          color={overdueCount > 0 ? "text-red-600 bg-red-50" : "text-gray-400 bg-gray-100"}
          href="/invoices"
        />
        <StatCard
          icon={<FolderOpen className="w-4 h-4" />}
          label="Active Projects"
          value={String(activeProjects.length)}
          color="text-violet-600 bg-violet-50"
          href="/projects"
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Clients"
          value={String(clients.length)}
          color="text-blue-600 bg-blue-50"
          href="/clients"
        />
      </div>

      {/* ── Main content grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Recent invoices — takes 2/3 width */}
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Invoices
              </p>
              <p className="text-sm font-semibold mt-0.5">Recent Invoices</p>
            </div>
            <Link
              href="/invoices"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-5">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center mb-3">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/invoices/new">Create Invoice</Link>
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Invoice
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentInvoices.map((inv) => {
                  const badge = STATUS_BADGE[inv.status];
                  return (
                    <tr key={inv.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-semibold hover:text-primary transition-colors"
                        >
                          {TYPE_LABEL[inv.type]} #{inv.number}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {inv.client.name}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {formatDate(inv.date)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {formatAmount(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Overdue invoices */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Attention Needed
                </p>
                <p className="text-sm font-semibold mt-0.5">Overdue</p>
              </div>
              {overdueInvoices.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
                  {overdueInvoices.length}
                </span>
              )}
            </div>

            {overdueInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                <TrendingUp className="w-5 h-5 text-emerald-500 mb-2" />
                <p className="text-xs text-muted-foreground">All caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {overdueInvoices.slice(0, 4).map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-accent/20 transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        #{inv.number} · {inv.client.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Due {formatDate(inv.dueDate)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-red-600 shrink-0 tabular-nums">
                      {formatAmount(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recently viewed by clients */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Client Activity
                </p>
                <p className="text-sm font-semibold mt-0.5">Recently Viewed</p>
              </div>
              {recentlyViewed.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">
                  {recentlyViewed.length}
                </span>
              )}
            </div>

            {recentlyViewed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                <Eye className="w-5 h-5 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No invoices viewed yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {recentlyViewed.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-accent/20 transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        #{inv.number} · {inv.client.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Viewed {formatDate(inv.lastViewed)}
                      </p>
                    </div>
                    <Eye className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Active projects */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Projects
                </p>
                <p className="text-sm font-semibold mt-0.5">Active Projects</p>
              </div>
              <Link
                href="/projects"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>

            {activeProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                <p className="text-xs text-muted-foreground">No active projects.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {activeProjects.slice(0, 4).map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-accent/20 transition-colors"
                  >
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                        folderColor(p.name)
                      )}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.client.name}
                      </p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0 tabular-nums">
                      {p._count.tasks} tasks
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border/50 bg-card p-4 flex items-start gap-3 hover:border-primary/30 hover:bg-accent/30 transition-colors group"
    >
      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
      </div>
    </Link>
  );
}

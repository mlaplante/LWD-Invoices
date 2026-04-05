import { Suspense } from "react";
import { api } from "@/trpc/server";
import { getUser } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { TopClients } from "@/components/dashboard/TopClients";
import { AgingReceivables } from "@/components/dashboard/AgingReceivables";
import { EstimateConversion } from "@/components/dashboard/EstimateConversion";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-load chart components to defer the ~400KB Recharts bundle
const RevenueChart = dynamic(
  () => import("@/components/dashboard/RevenueChart").then((m) => m.RevenueChart),
  { loading: () => <Skeleton className="h-72 rounded-2xl" /> },
);
const InvoiceStatusChart = dynamic(
  () => import("@/components/dashboard/InvoiceStatusChart").then((m) => m.InvoiceStatusChart),
  { loading: () => <Skeleton className="h-72 rounded-2xl" /> },
);
const ExpensesVsRevenueChart = dynamic(
  () => import("@/components/dashboard/ExpensesVsRevenueChart").then((m) => m.ExpensesVsRevenueChart),
  { loading: () => <Skeleton className="h-72 rounded-2xl" /> },
);

/* ── Async sections that stream in after the shell ── */

async function SummarySection() {
  const summary = await api.dashboard.summary({});
  return <SummaryCards summary={summary} />;
}

async function ChartsSection() {
  const [revenueChart, statusBreakdown] = await Promise.all([
    api.dashboard.revenueChart(),
    api.dashboard.invoiceStatusBreakdown(),
  ]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <RevenueChart data={revenueChart} />
      </div>
      <div>
        <InvoiceStatusChart data={statusBreakdown} />
      </div>
    </div>
  );
}

async function ExpensesSection() {
  const data = await api.dashboard.expensesVsRevenue();
  return <ExpensesVsRevenueChart data={data} />;
}

async function InsightsSection() {
  const [topClients, aging, conversion] = await Promise.all([
    api.dashboard.topClients(),
    api.dashboard.agingReceivables(),
    api.dashboard.estimateConversion(),
  ]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <TopClients data={topClients} />
      <AgingReceivables data={aging} />
      <EstimateConversion data={conversion} />
    </div>
  );
}

async function ActivitySection() {
  const items = await api.dashboard.activityFeed();
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Feed
        </p>
        <p className="text-sm font-semibold mt-0.5">Recent Activity</p>
      </div>
      <ActivityFeed items={items} />
    </div>
  );
}

export default async function DashboardPage() {
  const { data: { user } } = await getUser();

  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 17
        ? "Good afternoon"
        : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-5">
      {/* Greeting — renders immediately */}
      <div>
        <h1 className="font-display text-3xl tracking-tight">
          {greeting}
          {user?.user_metadata?.firstName
            ? `, ${user.user_metadata.firstName}`
            : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{dateLabel}</p>
      </div>

      {/* Quick Actions — static, renders immediately */}
      <QuickActions />

      {/* KPI Cards — streams in first (fast query) */}
      <Suspense fallback={<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>}>
        <SummarySection />
      </Suspense>

      {/* Charts — stream in parallel */}
      <Suspense fallback={<Skeleton className="h-72 rounded-2xl" />}>
        <ChartsSection />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-72 rounded-2xl" />}>
        <ExpensesSection />
      </Suspense>

      {/* Insights — Top Clients, Aging, Conversion */}
      <Suspense fallback={<Skeleton className="h-72 rounded-2xl" />}>
        <InsightsSection />
      </Suspense>

      {/* Activity Feed */}
      <Suspense fallback={<Skeleton className="h-48 rounded-2xl" />}>
        <ActivitySection />
      </Suspense>
    </div>
  );
}

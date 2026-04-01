import { api } from "@/trpc/server";
import { createClient } from "@/lib/supabase/server";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { InvoiceStatusChart } from "@/components/dashboard/InvoiceStatusChart";
import { ExpensesVsRevenueChart } from "@/components/dashboard/ExpensesVsRevenueChart";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [summary, revenueChart, statusBreakdown, expensesVsRevenue, activityFeed] =
    await Promise.all([
      api.dashboard.summary({}),
      api.dashboard.revenueChart(),
      api.dashboard.invoiceStatusBreakdown(),
      api.dashboard.expensesVsRevenue(),
      api.dashboard.activityFeed(),
    ]);

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
      {/* Greeting */}
      <div>
        <h1 className="font-display text-3xl tracking-tight">
          {greeting}
          {user?.user_metadata?.firstName
            ? `, ${user.user_metadata.firstName}`
            : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{dateLabel}</p>
      </div>

      {/* Quick Actions */}
      <QuickActions />

      {/* Summary KPI Cards */}
      <SummaryCards summary={summary} />

      {/* Charts row: Revenue + Invoice Status */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={revenueChart} />
        </div>
        <div>
          <InvoiceStatusChart data={statusBreakdown} />
        </div>
      </div>

      {/* Expenses vs Revenue */}
      <ExpensesVsRevenueChart data={expensesVsRevenue} />

      {/* Activity Feed */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Feed
          </p>
          <p className="text-sm font-semibold mt-0.5">Recent Activity</p>
        </div>
        <ActivityFeed items={activityFeed} />
      </div>
    </div>
  );
}

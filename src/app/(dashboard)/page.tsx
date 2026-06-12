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
import { DueThisWeek } from "@/components/dashboard/DueThisWeek";
import { CashFlowInsights } from "@/components/dashboard/CashFlowInsights";
import { OpenTasksCard } from "@/components/dashboard/OpenTasksCard";
import { RetainerBurnCard } from "@/components/dashboard/RetainerBurnCard";
import { DashboardLayoutEditor } from "@/components/dashboard/DashboardLayoutEditor";
import { WeeklyBriefing } from "@/components/dashboard/WeeklyBriefing";
import { Skeleton } from "@/components/ui/skeleton";
import type { WidgetKey } from "@/lib/dashboard-layout";

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

/* ── Async sections (one per WIDGET_KEY) ── */

async function SummarySection() {
  const summary = await api.dashboard.summary({});
  return <SummaryCards summary={summary} />;
}

async function RevenueSection() {
  const revenueChart = await api.dashboard.revenueChart();
  return <RevenueChart data={revenueChart} />;
}

async function InvoiceStatusSection() {
  const statusBreakdown = await api.dashboard.invoiceStatusBreakdown();
  return <InvoiceStatusChart data={statusBreakdown} />;
}

async function ExpensesSection() {
  const data = await api.dashboard.expensesVsRevenue();
  return <ExpensesVsRevenueChart data={data} />;
}

async function CashFlowInsightSection() {
  const data = await api.dashboard.cashFlowInsights();
  return <CashFlowInsights data={data} />;
}

async function TopClientsSection() {
  const data = await api.dashboard.topClients();
  return <TopClients data={data} />;
}

async function AgingSection() {
  const data = await api.dashboard.agingReceivables();
  return <AgingReceivables data={data} />;
}

async function DueThisWeekSection() {
  const data = await api.dashboard.dueThisWeek();
  return <DueThisWeek data={data} />;
}

async function EstimateConversionSection() {
  const data = await api.dashboard.estimateConversion();
  return <EstimateConversion data={data} />;
}

async function TasksSection() {
  const data = await api.dashboard.openTasks();
  return <OpenTasksCard data={data} />;
}

async function RetainerBurnSection() {
  const data = await api.dashboard.retainerBurn();
  return <RetainerBurnCard data={data} />;
}

async function ActivitySection() {
  const items = await api.dashboard.activityFeed();
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Feed
        </p>
        <p className="text-sm font-semibold mt-0.5">Recent Activity</p>
      </div>
      <ActivityFeed items={items} />
    </div>
  );
}

/* ── Key → section map ── */

type SectionEntry = {
  fallback: React.ReactNode;
  section: React.ReactNode;
};

function buildSectionMap(): Record<WidgetKey, SectionEntry> {
  return {
    summary: {
      fallback: (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ),
      section: <SummarySection />,
    },
    revenue: {
      fallback: <Skeleton className="h-72 rounded-2xl" />,
      section: <RevenueSection />,
    },
    invoiceStatus: {
      fallback: <Skeleton className="h-72 rounded-2xl" />,
      section: <InvoiceStatusSection />,
    },
    expenses: {
      fallback: <Skeleton className="h-72 rounded-2xl" />,
      section: <ExpensesSection />,
    },
    cashFlow: {
      fallback: <Skeleton className="h-64 rounded-2xl" />,
      section: <CashFlowInsightSection />,
    },
    topClients: {
      fallback: <Skeleton className="h-40 rounded-2xl" />,
      section: <TopClientsSection />,
    },
    aging: {
      fallback: <Skeleton className="h-40 rounded-2xl" />,
      section: <AgingSection />,
    },
    dueThisWeek: {
      fallback: <Skeleton className="h-40 rounded-2xl" />,
      section: <DueThisWeekSection />,
    },
    estimateConversion: {
      fallback: <Skeleton className="h-40 rounded-2xl" />,
      section: <EstimateConversionSection />,
    },
    tasks: {
      fallback: <Skeleton className="h-40 rounded-2xl" />,
      section: <TasksSection />,
    },
    retainerBurn: {
      fallback: <Skeleton className="h-40 rounded-2xl" />,
      section: <RetainerBurnSection />,
    },
    activity: {
      fallback: <Skeleton className="h-48 rounded-2xl" />,
      section: <ActivitySection />,
    },
    weeklyBriefing: {
      fallback: <Skeleton className="h-96 rounded-2xl" />,
      section: <BriefingSection />,
    },
  };
}

async function BriefingSection() {
  const data = await api.analytics.weeklyBriefing();
  const weekStart = new Date(data.generatedAt);
  weekStart.setDate(weekStart.getDate() - 7);
  return (
    <WeeklyBriefing
      data={{
        weekLabel: `${weekStart.toLocaleDateString()} - ${new Date(data.generatedAt).toLocaleDateString()}`,
        cashIn: data.forecast.find((h) => h.horizonDays === 30)?.projectedInflow ?? 0,
        cashOut: 0,
        netCashFlow: data.forecast.find((h) => h.horizonDays === 30)?.projectedPosition ?? 0,
        overdueInvoices: {
          count: data.overdue.count,
          totalAmount: data.overdue.total,
        },
        expenseAnomalies: {
          count: 0,
          details: [],
        },
        upcomingRenewals: {
          count: data.atRiskClients.length,
          clients: data.atRiskClients.map((client) => client.clientName),
        },
        recommendedActions: data.collections.map(
          (item) => `${item.recommendedAction}: #${item.invoiceNumber} · ${item.clientName}`,
        ),
      }}
      error={null}
    />
  );
}

export default async function DashboardPage() {
  const { data: { user } } = await getUser();

  // Fetch saved layout server-side; falls back to default order if none saved
  const layout = await api.dashboardLayout.get();

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

  const sectionMap = buildSectionMap();

  return (
    <div className="space-y-5">
      {/* Greeting — renders immediately */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            {greeting}
            {user?.user_metadata?.firstName
              ? `, ${user.user_metadata.firstName}`
              : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateLabel}</p>
        </div>
        {/* Edit layout button — client island */}
        <DashboardLayoutEditor />
      </div>

      {/* Quick Actions — static, renders immediately */}
      <QuickActions />

      {/* Widget sections — in saved order, hidden ones skipped */}
      {layout
        .filter((entry) => entry.visible)
        .map((entry) => {
          const { fallback, section } = sectionMap[entry.key];
          return (
            <Suspense key={entry.key} fallback={fallback}>
              {section}
            </Suspense>
          );
        })}
    </div>
  );
}

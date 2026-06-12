import type { WidgetKey } from "@/lib/dashboard-layout";

export const WIDGET_META: Record<WidgetKey, { label: string }> = {
  summary: { label: "KPIs" },
  revenue: { label: "Revenue" },
  invoiceStatus: { label: "Invoice status" },
  expenses: { label: "Expenses vs revenue" },
  cashFlow: { label: "Cash flow" },
  topClients: { label: "Top clients" },
  aging: { label: "Overdue / AR aging" },
  dueThisWeek: { label: "Due this week" },
  estimateConversion: { label: "Estimate conversion" },
  tasks: { label: "Open tasks" },
  retainerBurn: { label: "Retainer burn" },
  activity: { label: "Recent activity" },
  weeklyBriefing: { label: "Weekly briefing" },
};

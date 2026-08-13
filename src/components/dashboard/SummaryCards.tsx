import { StatCard, type StatTone } from "@/components/ui/stat-card";

type SummaryData = {
  revenueThisMonth: number;
  revenueChange: number | null;
  outstandingCount: number;
  outstandingTotal: number;
  overdueCount: number;
  overdueTotal: number;
  cashCollected: number;
  expensesThisMonth: number;
  expensesChange: number | null;
};

type Props = {
  summary: SummaryData;
};

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function delta(change: number | null): string | undefined {
  if (change === null) return undefined;
  return `${change >= 0 ? "+" : ""}${change}% vs last month`;
}

export function SummaryCards({ summary }: Props) {
  const cards: Array<{
    label: string;
    value: string;
    tone?: StatTone;
    hint?: string;
    href: string;
  }> = [
    {
      label: "Revenue · MTD",
      value: fmt(summary.revenueThisMonth),
      hint: delta(summary.revenueChange),
      href: "/reports",
    },
    {
      label: `Outstanding · ${summary.outstandingCount} invoice${summary.outstandingCount !== 1 ? "s" : ""}`,
      value: fmt(summary.outstandingTotal),
      tone: "primary",
      href: "/invoices?status=SENT&status=PARTIALLY_PAID&status=OVERDUE",
    },
    {
      label:
        summary.overdueCount > 0
          ? `Overdue · ${summary.overdueCount} invoice${summary.overdueCount !== 1 ? "s" : ""}`
          : "Overdue · all clear",
      value: fmt(summary.overdueTotal),
      tone: summary.overdueCount > 0 ? "danger" : "default",
      href: "/invoices?status=OVERDUE",
    },
    {
      label: "Cash collected",
      value: fmt(summary.cashCollected),
      href: "/reports/payments",
    },
    {
      label: "Expenses · MTD",
      value: fmt(summary.expensesThisMonth),
      hint: delta(summary.expensesChange),
      href: "/expenses",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  );
}

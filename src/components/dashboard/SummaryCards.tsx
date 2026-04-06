import Link from "next/link";
import { DollarSign, FileText, AlertTriangle, Wallet, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function SummaryCards({ summary }: Props) {
  const cards = [
    {
      icon: DollarSign,
      label: "Revenue",
      value: fmt(summary.revenueThisMonth),
      badge:
        summary.revenueChange !== null
          ? `${summary.revenueChange >= 0 ? "+" : ""}${summary.revenueChange}%`
          : null,
      badgeColor:
        summary.revenueChange !== null && summary.revenueChange >= 0
          ? "bg-emerald-50 text-emerald-600"
          : "bg-red-50 text-red-600",
      color: "text-emerald-600 bg-emerald-50",
      href: "/reports",
    },
    {
      icon: FileText,
      label: "Outstanding",
      value: fmt(summary.outstandingTotal),
      badge: `${summary.outstandingCount} invoice${summary.outstandingCount !== 1 ? "s" : ""}`,
      badgeColor: "bg-muted text-muted-foreground",
      color: "text-amber-600 bg-amber-50",
      href: "/invoices?status=SENT&status=PARTIALLY_PAID&status=OVERDUE",
    },
    {
      icon: AlertTriangle,
      label: "Overdue",
      value: fmt(summary.overdueTotal),
      badge:
        summary.overdueCount > 0
          ? `${summary.overdueCount} overdue`
          : "all clear",
      badgeColor:
        summary.overdueCount > 0
          ? "bg-red-50 text-red-600"
          : "bg-emerald-50 text-emerald-600",
      color:
        summary.overdueCount > 0
          ? "text-red-600 bg-red-50"
          : "text-gray-400 bg-gray-100",
      href: "/invoices?status=OVERDUE",
    },
    {
      icon: Wallet,
      label: "Cash Collected",
      value: fmt(summary.cashCollected),
      badge: null,
      badgeColor: "",
      color: "text-primary bg-primary/10",
      href: "/reports",
    },
    {
      icon: Receipt,
      label: "Expenses",
      value: fmt(summary.expensesThisMonth),
      badge:
        summary.expensesChange !== null
          ? `${summary.expensesChange >= 0 ? "+" : ""}${summary.expensesChange}%`
          : null,
      badgeColor:
        summary.expensesChange !== null && summary.expensesChange <= 0
          ? "bg-emerald-50 text-emerald-600"
          : "bg-red-50 text-red-600",
      color: "text-violet-600 bg-violet-50",
      href: "/expenses",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className="rounded-2xl border border-border/50 bg-card p-4 flex flex-col gap-3 hover:border-primary/30 hover:bg-accent/30 transition-colors group overflow-hidden"
        >
          <div className="flex items-start justify-between gap-2">
            <div
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                card.color
              )}
            >
              <card.icon className="w-4 h-4" />
            </div>
            {card.badge && (
              <span
                className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded-md",
                  card.badgeColor
                )}
              >
                {card.badge}
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              {card.label}
            </p>
            <p className="font-display text-2xl sm:text-3xl mt-0.5 leading-none truncate">
              {card.value}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

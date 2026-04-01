import { DollarSign, AlertTriangle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  outstanding: string;
  overdue: string;
  totalInvoices: number;
  currencySymbol: string;
};

const cards = [
  {
    key: "outstanding" as const,
    label: "Outstanding",
    icon: DollarSign,
    color: "text-amber-600",
    bg: "bg-amber-50",
    iconBg: "bg-amber-100",
  },
  {
    key: "overdue" as const,
    label: "Overdue",
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
    iconBg: "bg-red-100",
  },
  {
    key: "total" as const,
    label: "Total Invoices",
    icon: FileText,
    color: "text-blue-600",
    bg: "bg-blue-50",
    iconBg: "bg-blue-100",
  },
] as const;

export function DashboardSummaryCards({
  outstanding,
  overdue,
  totalInvoices,
}: Props) {
  const values = {
    outstanding,
    overdue,
    total: totalInvoices.toString(),
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={cn(
              "rounded-2xl border border-border/50 bg-card p-5 flex items-center gap-4"
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                card.iconBg
              )}
            >
              <Icon className={cn("h-5 w-5", card.color)} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {card.label}
              </p>
              <p className={cn("text-xl font-bold", card.color)}>
                {values[card.key]}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

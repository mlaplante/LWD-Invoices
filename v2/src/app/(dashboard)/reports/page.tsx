import Link from "next/link";
import { FileText, CreditCard, Receipt, ChevronRight } from "lucide-react";

const reports = [
  {
    href: "/reports/unpaid",
    label: "Unpaid Invoices",
    description: "Outstanding invoices requiring payment.",
    icon: <FileText className="w-4 h-4" />,
    color: "bg-amber-50 text-amber-600",
  },
  {
    href: "/reports/payments",
    label: "Payments by Gateway",
    description: "Revenue breakdown by payment method.",
    icon: <CreditCard className="w-4 h-4" />,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    href: "/reports/expenses",
    label: "Expense Breakdown",
    description: "Project expenses by category and supplier.",
    icon: <Receipt className="w-4 h-4" />,
    color: "bg-violet-50 text-violet-600",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group rounded-2xl border border-border/50 bg-card p-4 hover:border-primary/30 hover:bg-accent/30 transition-colors flex items-start gap-3"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.color}`}>
              {r.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                {r.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {r.description}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}

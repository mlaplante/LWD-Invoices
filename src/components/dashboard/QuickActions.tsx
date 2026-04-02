import Link from "next/link";
import { FileText, UserPlus, Receipt, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  {
    label: "Create Invoice",
    href: "/invoices/new",
    icon: FileText,
    color: "text-primary bg-primary/10",
  },
  {
    label: "New Client",
    href: "/clients/new",
    icon: UserPlus,
    color: "text-violet-600 bg-violet-50",
  },
  {
    label: "Log Expense",
    href: "/expenses/new",
    icon: Receipt,
    color: "text-amber-600 bg-amber-50",
  },
  {
    label: "Start Timer",
    href: "/timesheets",
    icon: Clock,
    color: "text-emerald-600 bg-emerald-50",
  },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {actions.map(({ label, href, icon: Icon, color }) => (
        <Button
          key={href}
          asChild
          variant="outline"
          className="h-auto flex-col gap-2 py-4 rounded-xl border-border/50 hover:border-primary/30 hover:bg-accent/30"
        >
          <Link href={href}>
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium">{label}</span>
          </Link>
        </Button>
      ))}
    </div>
  );
}

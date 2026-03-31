import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RecurringExpenseForm } from "@/components/expenses/RecurringExpenseForm";

export default async function NewRecurringExpensePage() {
  const [taxes, categories, suppliers, projects] = await Promise.all([
    api.taxes.list(),
    api.expenseCategories.list(),
    api.expenseSuppliers.list(),
    api.projects.list({}),
  ]);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/expenses/recurring"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Recurring Expenses
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">New Recurring Expense</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <RecurringExpenseForm
          mode="create"
          taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
          categories={categories}
          suppliers={suppliers}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </div>
  );
}

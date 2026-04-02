import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RecurringExpenseForm } from "@/components/expenses/RecurringExpenseForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditRecurringExpensePage({ params }: Props) {
  const { id } = await params;

  const [taxes, categories, suppliers, { items: projects }] = await Promise.all([
    api.taxes.list(),
    api.expenseCategories.list(),
    api.expenseSuppliers.list(),
    api.projects.list({ pageSize: 100 }),
  ]);

  let rec;
  try {
    rec = await api.recurringExpenses.getById({ id });
  } catch {
    notFound();
  }

  const formatDate = (d: Date | null | undefined) =>
    d ? new Date(d).toISOString().split("T")[0] : undefined;

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
        <h1 className="text-xl font-bold tracking-tight">Edit Recurring Expense</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <RecurringExpenseForm
          mode="edit"
          recurringExpenseId={rec.id}
          taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
          categories={categories}
          suppliers={suppliers}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          defaults={{
            name: rec.name,
            description: rec.description ?? undefined,
            qty: rec.qty,
            rate: Number(rec.rate),
            reimbursable: rec.reimbursable,
            frequency: rec.frequency,
            interval: rec.interval,
            startDate: formatDate(rec.startDate),
            endDate: formatDate(rec.endDate),
            maxOccurrences: rec.maxOccurrences ?? undefined,
            taxId: rec.taxId ?? undefined,
            categoryId: rec.categoryId ?? undefined,
            supplierId: rec.supplierId ?? undefined,
            projectId: rec.projectId ?? undefined,
          }}
        />
      </div>
    </div>
  );
}

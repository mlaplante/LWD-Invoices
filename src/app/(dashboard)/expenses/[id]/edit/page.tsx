import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditExpensePage({ params }: Props) {
  const { id } = await params;

  const [taxes, categories, suppliers, projects] = await Promise.all([
    api.taxes.list(),
    api.expenseCategories.list(),
    api.expenseSuppliers.list(),
    api.projects.list({}),
  ]);

  let expense;
  try {
    expense = await api.expenses.getById({ id });
  } catch {
    notFound();
  }

  const formatDate = (d: Date | null | undefined) =>
    d ? new Date(d).toISOString().split("T")[0] : undefined;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/expenses"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Expenses
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">Edit Expense</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <ExpenseForm
          mode="edit"
          expenseId={id}
          taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
          categories={categories}
          suppliers={suppliers}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          defaults={{
            name: expense.name,
            description: expense.description ?? undefined,
            qty: expense.qty,
            rate: expense.rate.toNumber(),
            dueDate: formatDate(expense.dueDate),
            paidAt: formatDate(expense.paidAt),
            reimbursable: expense.reimbursable,
            paymentDetails: expense.paymentDetails ?? undefined,
            taxId: expense.taxId ?? undefined,
            categoryId: expense.categoryId ?? undefined,
            supplierId: expense.supplierId ?? undefined,
            projectId: expense.projectId ?? undefined,
            receiptUrl: expense.receiptUrl ?? undefined,
          }}
        />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pencil, Trash2, Plus, Paperclip, Repeat } from "lucide-react";
import { toast } from "sonner";
export function ExpenseList() {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: expenses = [] } = trpc.expenses.list.useQuery({});

  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      toast.success("Expense deleted");
      setDeleteId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteId(null);
    },
  });

  const totalAmount = expenses.reduce(
    (s, e) => s + e.qty * Number(e.rate),
    0
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track business expenses across your organization.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/expenses/recurring">
              <Repeat className="w-4 h-4 mr-1.5" />
              Recurring
            </Link>
          </Button>
          <Button asChild>
            <Link href="/expenses/new">
              <Plus className="w-4 h-4 mr-1.5" />
              New Expense
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Total Expenses</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">{expenses.length}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Total Amount</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">${totalAmount.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Reimbursable</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">
              {expenses.filter((e) => e.reimbursable).length}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            All Expenses
          </p>
        </div>

        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
            <Button asChild size="sm">
              <Link href="/expenses/new">
                <Plus className="w-4 h-4 mr-1.5" />
                Add your first expense
              </Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Paid</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reimb.</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Receipt</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {expenses.map((expense) => {
                  const amount = expense.qty * Number(expense.rate);
                  return (
                    <tr key={expense.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-6 py-3.5 font-medium">{expense.name}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.category?.name ?? "—"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.project ? (
                          <Link href={`/projects/${expense.project.id}`} className="hover:text-primary transition-colors">
                            {expense.project.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.paidAt
                          ? new Date(expense.paidAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {expense.reimbursable ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Yes
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                        ${amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {expense.receiptUrl ? (
                          <a
                            href={expense.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex text-muted-foreground hover:text-primary transition-colors"
                            title="View receipt"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href={`/expenses/${expense.id}/edit`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                          {!expense.invoiceLineId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(expense.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border bg-muted/20">
                <tr>
                  <td colSpan={5} className="px-6 py-3 text-sm font-semibold text-right">Total</td>
                  <td className="px-6 py-3 text-right font-bold tabular-nums">${totalAmount.toFixed(2)}</td>
                  <td /><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog — single instance, controlled by deleteId */}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete expense"
        description="This cannot be undone."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        loading={deleteMutation.isPending}
        destructive
      />
    </div>
  );
}

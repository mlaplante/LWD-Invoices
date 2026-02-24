"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ExpenseForm } from "./ExpenseForm";
import { BillToInvoiceDialog } from "./BillToInvoiceDialog";

type Props = {
  projectId: string;
};

export function ExpensesTab({ projectId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [showBill, setShowBill] = useState(false);

  const { data: expenses = [], isLoading } = trpc.expenses.list.useQuery({ projectId });
  const { data: taxes = [] } = trpc.taxes.list.useQuery();
  const { data: categories = [] } = trpc.expenseCategories.list.useQuery();
  const { data: suppliers = [] } = trpc.expenseSuppliers.list.useQuery();
  const { data: project } = trpc.projects.get.useQuery({ id: projectId });

  const utils = trpc.useUtils();
  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => utils.expenses.list.invalidate({ projectId }),
  });

  const totalAmount = expenses.reduce((s, e) => s + e.qty * e.rate.toNumber(), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Total: <strong>{totalAmount.toFixed(2)}</strong>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBill(!showBill)}>
            Bill to Invoice
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            Add Expense
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border p-4">
          <h3 className="font-medium mb-3">Add Expense</h3>
          <ExpenseForm
            projectId={projectId}
            taxes={taxes}
            categories={categories}
            suppliers={suppliers}
            onSuccess={() => setShowForm(false)}
          />
        </div>
      )}

      {showBill && project && (
        <div className="rounded-lg border p-4">
          <h3 className="font-medium mb-3">Bill Expenses to Invoice</h3>
          <BillToInvoiceDialog
            projectId={projectId}
            clientId={project.clientId}
            mode="expenses"
            expenses={expenses}
            onSuccess={() => setShowBill(false)}
            onCancel={() => setShowBill(false)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Rate</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-center font-medium">Billed</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">{expense.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {expense.category?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">{expense.qty}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {expense.rate.toNumber().toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {(expense.qty * expense.rate.toNumber()).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {expense.invoiceLineId ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Billed
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!expense.invoiceLineId && (
                      <button
                        onClick={() => {
                          if (confirm("Delete this expense?")) {
                            deleteMutation.mutate({ id: expense.id });
                          }
                        }}
                        className="text-xs text-destructive hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

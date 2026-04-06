"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pencil, Trash2, Plus, Paperclip, Repeat, Pause, Play, Archive, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

function formatFrequency(freq: string, interval: number) {
  if (interval === 1) return FREQUENCY_LABELS[freq] ?? freq;
  return `Every ${interval} ${freq.toLowerCase().replace(/ly$/, "")}s`;
}

export function ExpenseList() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteRecurringId, setDeleteRecurringId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const utils = trpc.useUtils();
  const generateRecurring = trpc.expenses.generateRecurring.useMutation({
    onSuccess: () => utils.expenses.list.invalidate(),
  });
  useEffect(() => { generateRecurring.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: expenses = [] } = trpc.expenses.list.useQuery({});
  const { data: recurringExpenses = [] } = trpc.recurringExpenses.list.useQuery();
  const { data: categories = [] } = trpc.expenseCategories.list.useQuery();

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

  const deleteRecurringMutation = trpc.recurringExpenses.delete.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Recurring expense deleted");
      setDeleteRecurringId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteRecurringId(null);
    },
  });

  const toggleMutation = trpc.recurringExpenses.toggleActive.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteManyMutation = trpc.expenses.deleteMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} expense${result.count !== 1 ? "s" : ""} deleted`);
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      utils.expenses.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
      setBulkDeleteConfirm(false);
    },
  });

  const categorizeManyMutation = trpc.expenses.categorizeMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} expense${result.count !== 1 ? "s" : ""} categorized`);
      setSelected(new Set());
      setShowCategoryDropdown(false);
      utils.expenses.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
      setShowCategoryDropdown(false);
    },
  });

  const totalAmount = expenses.reduce(
    (s, e) => s + e.qty * Number(e.rate),
    0
  );

  const allExpenseIds = expenses.map((e) => e.id);
  const allSelected = allExpenseIds.length > 0 && allExpenseIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;
  const isLoading = deleteManyMutation.isPending || categorizeManyMutation.isPending;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allExpenseIds));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedIds = Array.from(selected);

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

      {/* Bulk action bar */}
      {someSelected && (
        <div className="sticky top-2 z-20 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-lg print:hidden">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-1.5 ml-auto relative">
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                disabled={isLoading}
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              >
                <Tag className="w-3.5 h-3.5" />
                Categorize
              </Button>
              {showCategoryDropdown && (
                <div className="absolute top-full mt-1 right-0 z-30 w-48 rounded-lg border border-border bg-card shadow-lg py-1">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent/50 transition-colors text-muted-foreground"
                    onClick={() => {
                      categorizeManyMutation.mutate({ ids: selectedIds, categoryId: null });
                    }}
                  >
                    Remove category
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent/50 transition-colors"
                      onClick={() => {
                        categorizeManyMutation.mutate({ ids: selectedIds, categoryId: cat.id });
                      }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs gap-1.5"
              disabled={isLoading}
              onClick={() => setBulkDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => { setSelected(new Set()); setShowCategoryDropdown(false); }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            All Expenses
          </p>
        </div>

        {expenses.length === 0 && recurringExpenses.length === 0 ? (
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
          <>
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border/40">
            {recurringExpenses.map((rec) => {
              const amount = rec.qty * Number(rec.rate);
              return (
                <div key={`rec-m-${rec.id}`} className="block rounded-xl border border-border/50 bg-card p-4 mx-4 my-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-primary shrink-0" />
                      {rec.name}
                    </p>
                    <p className="text-sm font-medium tabular-nums">${amount.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">{rec.supplier?.name ?? ""}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFrequency(rec.frequency, rec.interval)}
                    </p>
                  </div>
                </div>
              );
            })}
            {expenses.map((expense) => {
              const amount = expense.qty * Number(expense.rate);
              return (
                <div key={`exp-m-${expense.id}`} className="block rounded-xl border border-border/50 bg-card p-4 mx-4 my-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm truncate">{expense.name}</p>
                    <p className="text-sm font-medium tabular-nums">${amount.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">{expense.supplier?.name ?? ""}</p>
                    <p className="text-xs text-muted-foreground">
                      {expense.paidAt
                        ? new Date(expense.paidAt).toLocaleDateString()
                        : "\u2014"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-6 py-3 w-8 print:hidden">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-border"
                      aria-label="Select all expenses"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Paid</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reimb.</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Receipt</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recurringExpenses.map((rec) => {
                  const amount = rec.qty * Number(rec.rate);
                  return (
                    <tr key={`rec-${rec.id}`} className="hover:bg-accent/20 transition-colors bg-muted/10">
                      <td className="px-6 py-3.5 print:hidden" />
                      <td className="px-6 py-3.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Repeat className="w-3.5 h-3.5 text-primary shrink-0" />
                          {rec.name}
                          <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {formatFrequency(rec.frequency, rec.interval)}
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {rec.category?.name ?? "\u2014"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {rec.project ? (
                          <Link href={`/projects/${rec.project.id}`} className="hover:text-primary transition-colors">
                            {rec.project.name}
                          </Link>
                        ) : "\u2014"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground text-xs">
                        {rec.isActive ? (
                          <span>Next: {new Date(rec.nextRunAt).toLocaleDateString()}</span>
                        ) : (
                          <span className="text-zinc-400">Paused</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {rec.reimbursable ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Yes
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">\u2014</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                        ${amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-center text-muted-foreground tabular-nums text-xs">
                        {rec.occurrenceCount}x
                      </td>
                      <td className="px-6 py-3.5 text-right print:hidden">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleMutation.mutate({ id: rec.id })}
                            title={rec.isActive ? "Pause" : "Resume"}
                          >
                            {rec.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </Button>
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href={`/expenses/recurring/${rec.id}/edit`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteRecurringId(rec.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {recurringExpenses.length > 0 && expenses.length > 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-1.5 bg-muted/30">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        One-Time Expenses
                      </p>
                    </td>
                  </tr>
                )}
                {expenses.map((expense) => {
                  const amount = expense.qty * Number(expense.rate);
                  const isSelected = selected.has(expense.id);
                  return (
                    <tr
                      key={expense.id}
                      className={cn(
                        "hover:bg-accent/20 transition-colors",
                        isSelected && "bg-accent/20"
                      )}
                    >
                      <td className="px-6 py-3.5 print:hidden">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(expense.id)}
                          className="rounded border-border"
                          aria-label={`Select expense ${expense.name}`}
                        />
                      </td>
                      <td className="px-6 py-3.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          {expense.name}
                          {expense.recurringExpenseId && (
                            <Link
                              href={`/expenses/recurring/${expense.recurringExpenseId}/edit`}
                              title="From recurring expense"
                              className="text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Repeat className="w-3 h-3" />
                            </Link>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.category?.name ?? "\u2014"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.project ? (
                          <Link href={`/projects/${expense.project.id}`} className="hover:text-primary transition-colors">
                            {expense.project.name}
                          </Link>
                        ) : "\u2014"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.paidAt
                          ? new Date(expense.paidAt).toLocaleDateString()
                          : "\u2014"}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {expense.reimbursable ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Yes
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">\u2014</span>
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
                          <span className="text-muted-foreground text-xs">\u2014</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right print:hidden">
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
                  <td className="print:hidden" />
                  <td colSpan={5} className="px-6 py-3 text-sm font-semibold text-right">Total</td>
                  <td className="px-6 py-3 text-right font-bold tabular-nums">${totalAmount.toFixed(2)}</td>
                  <td /><td />
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Delete confirmation dialogs */}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete expense"
        description="This cannot be undone."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        loading={deleteMutation.isPending}
        destructive
      />
      <ConfirmDialog
        open={deleteRecurringId !== null}
        onOpenChange={(open) => { if (!open) setDeleteRecurringId(null); }}
        title="Delete recurring expense"
        description="Generated expenses will remain. This only removes the recurring template."
        onConfirm={() => { if (deleteRecurringId) deleteRecurringMutation.mutate({ id: deleteRecurringId }); }}
        loading={deleteRecurringMutation.isPending}
        destructive
      />
      <ConfirmDialog
        open={bulkDeleteConfirm}
        onOpenChange={(open) => { if (!open) setBulkDeleteConfirm(false); }}
        title={`Delete ${selected.size} expense${selected.size !== 1 ? "s" : ""}?`}
        description="Billed expenses will be skipped. This cannot be undone."
        onConfirm={() => deleteManyMutation.mutate({ ids: selectedIds })}
        loading={deleteManyMutation.isPending}
        destructive
      />
    </div>
  );
}

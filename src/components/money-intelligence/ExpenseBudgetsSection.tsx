"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

function usd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const STATUS_STYLES = {
  under: { bar: "bg-emerald-500", label: "On track", text: "text-emerald-600" },
  warning: { bar: "bg-amber-500", label: "Trending over", text: "text-amber-600" },
  over: { bar: "bg-red-500", label: "Over budget", text: "text-red-600" },
} as const;

function BudgetBar({
  name,
  actual,
  budget,
  projected,
  priorMonthActual,
  status,
}: {
  name: string;
  actual: number;
  budget: number;
  projected: number;
  priorMonthActual: number;
  status: keyof typeof STATUS_STYLES;
}) {
  const styles = STATUS_STYLES[status];
  const widthPercent = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium truncate">{name}</span>
        <span className="tabular-nums text-muted-foreground shrink-0">
          {usd(actual)} <span className="text-muted-foreground/60">/ {usd(budget)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", styles.bar)}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className={styles.text}>{styles.label}</span>
        <span className="tabular-nums">
          Pace: {usd(projected)} by month end · last month {usd(priorMonthActual)}
        </span>
      </div>
    </div>
  );
}

/**
 * Expense budgets vs. month-to-date actuals on the Money Intelligence hub.
 * Budgets are monthly targets per expense category (plus an optional org-wide
 * cap); actuals come from recorded expenses, with a straight-line projection
 * to month end so overspend is visible before it happens.
 */
export function ExpenseBudgetsSection() {
  const [manageOpen, setManageOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.analytics.expenseBudgetVsActual.useQuery();
  const { data: budgets = [] } = trpc.expenseBudgets.list.useQuery(undefined, {
    enabled: manageOpen,
  });
  const { data: categories = [] } = trpc.expenseCategories.list.useQuery(undefined, {
    enabled: manageOpen,
  });

  const invalidate = () => {
    utils.analytics.expenseBudgetVsActual.invalidate();
    utils.expenseBudgets.list.invalidate();
  };

  const upsert = trpc.expenseBudgets.upsert.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });
  const remove = trpc.expenseBudgets.delete.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  // "" key = the org-wide budget row.
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId ?? "", b]));

  function draftFor(categoryId: string): string {
    if (categoryId in drafts) return drafts[categoryId];
    const existing = budgetByCategory.get(categoryId);
    return existing ? String(Number(existing.monthlyAmount)) : "";
  }

  function saveDraft(categoryId: string) {
    const raw = draftFor(categoryId).trim();
    const existing = budgetByCategory.get(categoryId);
    if (raw === "" || Number(raw) === 0) {
      if (existing) remove.mutate({ id: existing.id });
      return;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (existing && Number(existing.monthlyAmount) === amount) return;
    upsert.mutate({ categoryId: categoryId || null, monthlyAmount: amount });
  }

  const hasBudgets = Boolean(data && (data.rows.length > 0 || data.overall));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense budgets</CardTitle>
        <CardDescription>
          Monthly spending targets vs. what you&apos;ve actually recorded, with a run-rate
          projection to month end.
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Manage budgets
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Calculating…</p>
        ) : hasBudgets && data ? (
          <>
            {data.overall && (
              <BudgetBar
                name="All expenses"
                actual={data.overall.actual}
                budget={data.overall.monthlyBudget}
                projected={data.overall.projected}
                priorMonthActual={data.overall.priorMonthActual}
                status={data.overall.status}
              />
            )}
            {data.rows.map((row) => (
              <BudgetBar
                key={row.budgetId}
                name={row.categoryName ?? "Uncategorized"}
                actual={row.actual}
                budget={row.monthlyBudget}
                projected={row.projected}
                priorMonthActual={row.priorMonthActual}
                status={row.status}
              />
            ))}
            {data.rows.length > 0 && data.unbudgetedActual > 0 && (
              <p className="text-xs text-muted-foreground">
                Plus {usd(data.unbudgetedActual)} this month in categories without a budget.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No budgets yet. Set a monthly target per expense category — or one org-wide cap —
            and this section tracks your actual spend against it.
          </p>
        )}
      </CardContent>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage expense budgets</DialogTitle>
            <DialogDescription>
              Monthly targets. Clear a field (or set it to 0) to remove that budget.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">All expenses (org-wide)</span>
              <Input
                type="number"
                min="0"
                step="50"
                className="w-32 h-8 text-right tabular-nums"
                placeholder="—"
                value={draftFor("")}
                onChange={(e) => setDrafts((d) => ({ ...d, "": e.target.value }))}
                onBlur={() => saveDraft("")}
              />
            </div>
            {categories.length > 0 && <div className="h-px bg-border" />}
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between gap-3">
                <span className="text-sm truncate">{cat.name}</span>
                <Input
                  type="number"
                  min="0"
                  step="50"
                  className="w-32 h-8 text-right tabular-nums"
                  placeholder="—"
                  value={draftFor(cat.id)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [cat.id]: e.target.value }))}
                  onBlur={() => saveDraft(cat.id)}
                />
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No expense categories yet — create some under Expenses to budget per category.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

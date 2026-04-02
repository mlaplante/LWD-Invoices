import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExpenseCategoryManager } from "@/components/settings/ExpenseCategoryManager";
import { ExpenseSupplierManager } from "@/components/settings/ExpenseSupplierManager";

export default async function ExpenseSettingsPage() {
  const [categories, suppliers] = await Promise.all([
    api.expenseCategories.list(),
    api.expenseSuppliers.list(),
  ]);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight truncate">Expense Settings</h1>
      </div>

      {/* Categories */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Categories
          </p>
          <p className="text-base font-semibold mt-1">Expense Categories</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Categories used to classify expenses across your organization.
          </p>
        </div>
        <div className="px-6 py-6">
          <ExpenseCategoryManager initialCategories={categories} />
        </div>
      </div>

      {/* Suppliers */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Suppliers
          </p>
          <p className="text-base font-semibold mt-1">Expense Suppliers</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vendors and suppliers that can be associated with expenses.
          </p>
        </div>
        <div className="px-6 py-6">
          <ExpenseSupplierManager initialSuppliers={suppliers} />
        </div>
      </div>
    </div>
  );
}

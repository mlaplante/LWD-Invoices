import { api, HydrateClient } from "@/trpc/server";
import { ExpenseList } from "@/components/expenses/ExpenseList";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  void api.expenses.list.prefetch({});
  void api.recurringExpenses.list.prefetch();
  void api.expenseCategories.list.prefetch();

  return (
    <HydrateClient>
      <ExpenseList />
    </HydrateClient>
  );
}

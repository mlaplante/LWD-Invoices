import { api } from "@/trpc/server";
import { ExpenseList } from "@/components/expenses/ExpenseList";

export default async function ExpensesPage() {
  const expenses = await api.expenses.list({});
  return <ExpenseList initialExpenses={expenses} />;
}

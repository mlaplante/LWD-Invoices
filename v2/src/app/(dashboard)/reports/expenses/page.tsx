import { api } from "@/trpc/server";

export default async function ExpensesReportPage() {
  const expenses = await api.reports.expenseBreakdown({});

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Expense Breakdown</h1>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Project</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-right p-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{e.name}</td>
                <td className="p-3 text-muted-foreground">{e.project.name}</td>
                <td className="p-3">{e.category?.name ?? "—"}</td>
                <td className="p-3">{e.supplier?.name ?? "—"}</td>
                <td className="p-3 text-right font-medium">
                  ${(e.qty * Number(e.rate)).toFixed(2)}
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No expenses found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

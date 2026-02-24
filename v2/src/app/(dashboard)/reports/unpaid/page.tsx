import { api } from "@/trpc/server";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default async function UnpaidReportPage() {
  const invoices = await api.reports.unpaidInvoices({});

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Unpaid Invoices</h1>
      <p className="text-muted-foreground">{invoices.length} invoices outstanding</p>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Invoice</th>
              <th className="text-left p-3">Client</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Due</th>
              <th className="text-right p-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="p-3 font-mono">{inv.number}</td>
                <td className="p-3">{inv.client.name}</td>
                <td className="p-3">
                  <Badge variant="outline">{inv.status}</Badge>
                </td>
                <td className="p-3 text-muted-foreground">
                  {inv.dueDate
                    ? formatDistanceToNow(new Date(inv.dueDate), { addSuffix: true })
                    : "—"}
                </td>
                <td className="p-3 text-right font-medium">
                  {inv.currency.symbol}
                  {Number(inv.total).toFixed(2)}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No unpaid invoices
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

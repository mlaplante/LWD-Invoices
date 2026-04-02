import { formatDate } from "@/lib/format";

type PaymentRow = {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
  invoiceNumber: string;
  currencySymbol: string;
};

type Props = {
  payments: PaymentRow[];
};

export function DashboardPaymentHistory({ payments }: Props) {
  if (payments.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <h2 className="text-base font-semibold text-foreground mb-4">
        Recent Payments
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-3 font-semibold">Date</th>
            <th className="pb-3 font-semibold">Invoice</th>
            <th className="pb-3 font-semibold">Method</th>
            <th className="pb-3 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr
              key={p.id}
              className="border-b border-border/50 last:border-0"
            >
              <td className="py-3 text-muted-foreground">
                {formatDate(p.paidAt)}
              </td>
              <td className="py-3 text-muted-foreground">#{p.invoiceNumber}</td>
              <td className="py-3 capitalize text-muted-foreground">
                {p.method}
              </td>
              <td className="py-3 text-right font-medium text-foreground">
                {p.currencySymbol}
                {parseFloat(p.amount).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

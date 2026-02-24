import { api } from "@/trpc/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PaymentsReportPage() {
  const byGateway = await api.reports.paymentsByGateway({});
  const entries = Object.entries(byGateway);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Payments by Gateway</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {entries.map(([method, stats]) => (
          <Card key={method}>
            <CardHeader>
              <CardTitle className="text-base capitalize">
                {method.replace(/_/g, " ").toLowerCase()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transactions</span>
                <span className="font-medium">{stats.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">{stats.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gateway fees</span>
                <span className="font-medium text-destructive">
                  -{stats.fees.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {entries.length === 0 && (
          <p className="col-span-3 text-muted-foreground">No payments recorded</p>
        )}
      </div>
    </div>
  );
}

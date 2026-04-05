import Link from "next/link";

type TopClient = {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  total: number;
};

export function TopClients({ data }: { data: TopClient[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <h3 className="font-semibold text-sm mb-3">Top Clients</h3>
        <p className="text-sm text-muted-foreground">No payments this month</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <h3 className="font-semibold text-sm mb-3">Top Clients This Month</h3>
      <div className="space-y-3">
        {data.map((client, i) => (
          <Link
            key={client.clientId}
            href={`/clients/${client.clientId}`}
            className="flex items-center justify-between group hover:bg-accent/30 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground w-4">{i + 1}</span>
              <div>
                <p className="text-sm font-medium group-hover:text-primary transition-colors">{client.clientName}</p>
                <p className="text-xs text-muted-foreground">{client.invoiceCount} invoice{client.invoiceCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <span className="text-sm font-semibold">
              ${client.total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

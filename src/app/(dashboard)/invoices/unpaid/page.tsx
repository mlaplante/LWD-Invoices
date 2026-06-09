"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";

export default function UnpaidInvoicesPage() {
  const { data, isLoading } = trpc.invoices.openForReminder.useQuery({});

  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl tracking-tight">Unpaid invoices</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing outstanding. 🎉</p>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-card">
          {data.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/invoices/${inv.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 active:bg-accent"
              >
                <span className="truncate text-sm font-medium">
                  {inv.number} — {inv.clientName}
                </span>
                <span className="text-sm tabular-nums">{inv.total.toFixed(2)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

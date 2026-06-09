import Link from "next/link";
import type { ProposalStatus } from "@/server/routers/proposals-helpers";
import { formatCurrency } from "@/lib/format";

const STATUS_BADGE: Record<ProposalStatus, { label: string; className: string }> = {
  none: { label: "No draft", className: "bg-muted text-muted-foreground" },
  draft: { label: "Draft", className: "bg-amber-50 text-amber-700" },
  sent: { label: "Sent", className: "bg-blue-50 text-blue-700" },
  viewed: { label: "Viewed", className: "bg-emerald-50 text-emerald-700" },
  signed: { label: "Signed", className: "bg-primary/10 text-primary" },
};

type Row = {
  id: string;
  number: string;
  title: string | null;
  clientName: string;
  value: number;
  currencySymbol: string | null;
  currencySymbolPosition: string;
  lastActivity: Date | string;
  status: ProposalStatus;
};

export function ProposalList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">No proposals yet.</p>
        <Link href="/proposals/new" className="mt-3 inline-block text-sm font-medium text-primary">
          Create your first proposal →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">Client</th>
            <th scope="col" className="px-4 py-3 text-left">Proposal</th>
            <th scope="col" className="px-4 py-3 text-left">Status</th>
            <th scope="col" className="px-4 py-3 text-right">Value</th>
            <th scope="col" className="px-4 py-3 text-right">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = STATUS_BADGE[r.status];
            return (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/proposals/${r.id}`} className="font-medium hover:underline">
                    {r.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.title ?? r.number}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(r.value, r.currencySymbol ?? "", r.currencySymbolPosition)}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {new Date(r.lastActivity).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

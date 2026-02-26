import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function fmtHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default async function TimeTrackingReportPage() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const data = await api.reports.timeTracking({ from });

  const totalMinutes = data.reduce((s, r) => s + r.totalMinutes, 0);
  const totalBillable = data.reduce((s, r) => s + r.billableAmount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Time Tracking</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Hours</p>
          <p className="text-2xl font-bold mt-1">{fmtHours(totalMinutes)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Billable Value</p>
          <p className="text-2xl font-bold mt-1 text-primary">${totalBillable.toFixed(2)}</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card px-6 py-12 text-center text-muted-foreground text-sm">
          No time entries this month.
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3 text-left">Project</th>
                <th className="px-5 py-3 text-left">Client</th>
                <th className="px-5 py-3 text-right">Hours</th>
                <th className="px-5 py-3 text-right">Billable</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.projectId} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                  <td className="px-5 py-3 font-medium">{row.projectName}</td>
                  <td className="px-5 py-3 text-muted-foreground">{row.clientName}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmtHours(row.totalMinutes)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-primary">${row.billableAmount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

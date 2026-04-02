"use client";

import { trpc } from "@/trpc/client";

type Props = { invoiceId: string };

export function ReminderHistory({ invoiceId }: Props) {
  const { data: logs = [] } = trpc.reminderSequences.getInvoiceLogs.useQuery({ invoiceId });

  if (logs.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Reminder History</h2>
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sent</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sequence</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 text-muted-foreground">
                  {new Date(log.sentAt).toLocaleDateString("en-US", {
                    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{log.step.sequence.name}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {log.step.daysRelativeToDue < 0
                    ? `${Math.abs(log.step.daysRelativeToDue)}d before`
                    : log.step.daysRelativeToDue === 0
                    ? "Due date"
                    : `+${log.step.daysRelativeToDue}d after`}
                </td>
                <td className="px-5 py-3">{log.step.subject}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { TimeEntryForm } from "./TimeEntryForm";
import { BillToInvoiceDialog } from "./BillToInvoiceDialog";

type Props = {
  projectId: string;
};

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

export function TimeTab({ projectId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [showBill, setShowBill] = useState(false);

  const { data: entries = [], isLoading } = trpc.timeEntries.list.useQuery({ projectId });
  const { data: project } = trpc.projects.get.useQuery({ id: projectId });
  const tasks = project?.tasks ?? [];
  const { data: retainerHours } = trpc.hoursRetainers.monthlyHoursForClient.useQuery(
    { clientId: project?.clientId ?? "" },
    { enabled: !!project?.clientId },
  );

  const deleteMutation = trpc.timeEntries.delete.useMutation({
    onSuccess: () => {
      void utils.timeEntries.list.invalidate({ projectId });
    },
  });
  const utils = trpc.useUtils();

  const totalMinutes = entries.reduce((s, e) => s + e.minutes.toNumber(), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Total: <strong>{formatMinutes(totalMinutes)}</strong>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBill(!showBill)}>
            Bill to Invoice
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            Log Time
          </Button>
        </div>
      </div>

      {retainerHours && Number(retainerHours.totalHours) > 0 && (
        <div className="text-sm rounded bg-muted px-3 py-2 text-muted-foreground">
          {Number(retainerHours.totalHours).toFixed(2)}h logged against retainers for this client in {retainerHours.currentMonthLabel}.
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl border border-border/50 p-4">
          <h3 className="font-medium mb-3">Log Time</h3>
          <TimeEntryForm
            projectId={projectId}
            tasks={tasks.map((t) => ({ id: t.id, name: t.name }))}
            clientId={project?.clientId}
            onSuccess={() => setShowForm(false)}
          />
        </div>
      )}

      {showBill && project && (
        <div className="rounded-2xl border border-border/50 p-4">
          <h3 className="font-medium mb-3">Bill Time to Invoice</h3>
          <BillToInvoiceDialog
            projectId={projectId}
            clientId={project.clientId}
            mode="time"
            timeEntries={entries}
            onSuccess={() => setShowBill(false)}
            onCancel={() => setShowBill(false)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Task</th>
                <th className="px-4 py-2 text-right font-medium">Time</th>
                <th className="px-4 py-2 text-left font-medium">Note</th>
                <th className="px-4 py-2 text-center font-medium">Billed</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">{entry.task?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMinutes(entry.minutes.toNumber())}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{entry.note ?? "—"}</td>
                  <td className="px-4 py-2 text-center">
                    {entry.invoiceLineId ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Billed
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!entry.invoiceLineId && (
                      <button
                        onClick={() => {
                          if (confirm("Delete this time entry?")) {
                            deleteMutation.mutate({ id: entry.id });
                          }
                        }}
                        className="text-xs text-destructive hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

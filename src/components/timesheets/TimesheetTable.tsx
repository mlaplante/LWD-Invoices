"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Project = { id: string; name: string };

type Props = {
  projects: Project[];
};

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

export function TimesheetTable({ projects }: Props) {
  const [filters, setFilters] = useState({
    projectId: "",
    userId: "",
    dateFrom: "",
    dateTo: "",
  });

  const { data: entries = [], isLoading } = trpc.timesheets.list.useQuery({
    projectId: filters.projectId || undefined,
    userId: filters.userId || undefined,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
  });

  const totalRaw = entries.reduce((s, e) => s + e.rawMinutes, 0);
  const totalRounded = entries.reduce((s, e) => s + e.roundedMinutes, 0);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-48">
          <label className="text-xs text-muted-foreground block mb-1">Project</label>
          <Select
            value={filters.projectId || "all"}
            onValueChange={(v) =>
              setFilters((p) => ({ ...p, projectId: v === "all" ? "" : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">From</label>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))}
            className="w-40"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">To</label>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))}
            className="w-40"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time entries found.</p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-border/50 bg-card p-4 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{entry.project?.name ?? "Retainer"}</p>
                  {entry.invoiceLineId ? (
                    <span className="shrink-0 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      Billed
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Unbilled</span>
                  )}
                </div>
                {entry.task && (
                  <p className="text-xs text-muted-foreground">{entry.task.name}</p>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString()}
                  </p>
                  <p className="text-sm font-medium tabular-nums">
                    {formatMinutes(entry.roundedMinutes)}
                  </p>
                </div>
                {entry.note && (
                  <p className="text-xs text-muted-foreground truncate">{entry.note}</p>
                )}
              </div>
            ))}
            <div className="rounded-xl border border-border/50 bg-muted/30 p-4 flex items-center justify-between">
              <p className="text-sm font-medium">Totals</p>
              <p className="text-sm font-semibold tabular-nums">{formatMinutes(totalRounded)}</p>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Project</th>
                  <th className="px-4 py-2 text-left font-medium">Task</th>
                  <th className="px-4 py-2 text-right font-medium">Raw</th>
                  <th className="px-4 py-2 text-right font-medium">Rounded</th>
                  <th className="px-4 py-2 text-left font-medium">Note</th>
                  <th className="px-4 py-2 text-center font-medium">Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">{entry.project?.name ?? "Retainer"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {entry.task?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMinutes(entry.rawMinutes)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {formatMinutes(entry.roundedMinutes)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {entry.note ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {entry.invoiceLineId ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          Billed
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">
                    Totals
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {formatMinutes(totalRaw)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {formatMinutes(totalRounded)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type Props = {
  data: { status: string; count: number }[];
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#9ca3af",
  SENT: "#f59e0b",
  PARTIALLY_PAID: "#3b82f6",
  PAID: "#10b981",
  OVERDUE: "#ef4444",
  ACCEPTED: "#8b5cf6",
  REJECTED: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Unpaid",
  PARTIALLY_PAID: "Partial",
  PAID: "Paid",
  OVERDUE: "Overdue",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

export function InvoiceStatusChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Invoices
        </p>
        <p className="text-sm font-semibold mt-0.5">Status Breakdown</p>
      </div>
      <div className="px-4 py-4 flex items-center gap-4">
        <div className="h-[200px] w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                dataKey="count"
                nameKey="status"
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={STATUS_COLORS[entry.status] ?? "#d1d5db"}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--card))",
                  fontSize: "0.8125rem",
                }}
                formatter={(value, name) => [
                  value,
                  STATUS_LABELS[String(name)] ?? name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex-1 space-y-2 min-w-0">
          {data.map((entry) => (
            <div
              key={entry.status}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      STATUS_COLORS[entry.status] ?? "#d1d5db",
                  }}
                />
                <span className="text-muted-foreground truncate">
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </span>
              </div>
              <span className="font-mono font-medium tabular-nums">
                {entry.count}
              </span>
            </div>
          ))}
          {total > 0 && (
            <>
              <div className="h-px bg-border/60" />
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold">Total</span>
                <span className="font-mono font-semibold tabular-nums">
                  {total}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const VALID_GROUP_BY = ["week", "month"] as const;
const VALID_DIMENSION = ["client", "project", "user"] as const;

type GroupBy = (typeof VALID_GROUP_BY)[number];
type Dimension = (typeof VALID_DIMENSION)[number];

function buildHref(
  basePath: string,
  params: Record<string, string>,
  overrides: Record<string, string>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...overrides })) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default async function UtilizationReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;

  // Date parsing — mirrors time/page.tsx exactly
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw   = params.to   ? new Date(params.to)   : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to   = toRaw   && !isNaN(toRaw.getTime())   ? toRaw   : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  // Toggle params with validation + defaults
  const groupBy: GroupBy =
    (VALID_GROUP_BY as readonly string[]).includes(params.groupBy ?? "")
      ? (params.groupBy as GroupBy)
      : "month";

  const dimension: Dimension =
    (VALID_DIMENSION as readonly string[]).includes(params.dimension ?? "")
      ? (params.dimension as Dimension)
      : "project";

  const [data, org] = await Promise.all([
    api.reports.utilization({ from, to, groupBy, dimension }),
    api.organization.get(),
  ]);

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  const dimensionLabel =
    dimension === "client" ? "Client" : dimension === "project" ? "Project" : "User";

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Utilization"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={dateRange}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="text-muted-foreground hover:text-foreground transition-colors print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Utilization</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <ReportFilters basePath="/reports/utilization" from={params.from} to={params.to} />

        {/* Week / Month toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
          {VALID_GROUP_BY.map((g) => (
            <Link
              key={g}
              href={buildHref("/reports/utilization", params, { groupBy: g })}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                groupBy === g
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </Link>
          ))}
        </div>

        {/* Client / Project / User toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
          {VALID_DIMENSION.map((d) => (
            <Link
              key={d}
              href={buildHref("/reports/utilization", params, { dimension: d })}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                dimension === d
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </Link>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Overall Utilization
          </p>
          <p className="text-2xl font-bold mt-1">
            {(data.summary.utilizationPct * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Billable Hours
          </p>
          <p className="text-2xl font-bold mt-1 text-primary">
            {data.summary.billableHours.toFixed(1)}h
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Non-billable Hours
          </p>
          <p className="text-2xl font-bold mt-1">{data.summary.nonBillableHours.toFixed(1)}h</p>
        </div>
      </div>

      {/* Table */}
      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card px-6 py-12 text-center text-muted-foreground text-sm">
          No time entries for this period.
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/50">
                <tr className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-3 text-left">{dimensionLabel}</th>
                  <th className="px-5 py-3 text-right">Billable</th>
                  <th className="px-5 py-3 text-right">Non-billable</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-border/50 last:border-0 hover:bg-accent/30"
                  >
                    <td className="px-5 py-3 font-medium">{row.label}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-primary">
                      {row.billableHours.toFixed(1)}h
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                      {row.nonBillableHours.toFixed(1)}h
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {row.totalHours.toFixed(1)}h
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(row.utilizationPct * 100, 100).toFixed(0)}%` }}
                          />
                        </span>
                        <span className="font-medium">
                          {(row.utilizationPct * 100).toFixed(0)}%
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

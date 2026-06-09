/**
 * Utilization aggregation. Pure functions over time entries so they can be
 * unit-tested without a DB. "Billable" is derived (there is no billable flag on
 * TimeEntry): billable = an hours-retainer entry, or time on a non-flat-rate
 * project with a positive rate.
 */

export type UtilizationGroupBy = "week" | "month";
export type UtilizationDimension = "client" | "project" | "user";

export interface UtilizationEntry {
  date: Date;
  minutes: number;
  retainerId: string | null;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  userId: string | null;
  userName: string | null;
  project: { isFlatRate: boolean; rate: number } | null;
}

export interface UtilizationRow {
  key: string;
  label: string;
  period: string;
  periodLabel: string;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  utilizationPct: number;
}

export interface UtilizationResult {
  groupBy: UtilizationGroupBy;
  dimension: UtilizationDimension;
  rows: UtilizationRow[];
  summary: Omit<UtilizationRow, "key" | "label" | "period" | "periodLabel">;
}

export function classifyBillable(entry: {
  retainerId: string | null;
  project: { isFlatRate: boolean; rate: number } | null;
}): boolean {
  if (entry.retainerId) return true;
  if (entry.project && !entry.project.isFlatRate && entry.project.rate > 0) return true;
  return false;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export function monthBucket(date: Date): { key: string; label: string } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const key = `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = `${MONTH_NAMES[m]} ${y}`;
  return { key, label };
}

export function weekBucket(date: Date): { key: string; label: string } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const day = date.getUTCDate();
  const d = new Date(Date.UTC(y, m, day));
  const dow = (d.getUTCDay() + 6) % 7; // 0=Mon, 6=Sun
  d.setUTCDate(d.getUTCDate() - dow);
  const wy = d.getUTCFullYear();
  const wm = d.getUTCMonth();
  const wd = d.getUTCDate();
  const key = `${wy}-${String(wm + 1).padStart(2, "0")}-${String(wd).padStart(2, "0")}`;
  const label = `Week of ${MONTH_NAMES[wm]} ${wd}, ${wy}`;
  return { key, label };
}

function pct(billable: number, total: number): number {
  return total > 0 ? billable / total : 0;
}

function dimensionKey(e: UtilizationEntry, dim: UtilizationDimension): { key: string; label: string } {
  if (dim === "client") return { key: e.clientId ?? "none", label: e.clientName ?? "Unassigned" };
  if (dim === "project") return { key: e.projectId ?? "none", label: e.projectName ?? "No project" };
  return { key: e.userId ?? "none", label: e.userName ?? "Unknown" };
}

export function summarizeUtilization(
  entries: UtilizationEntry[],
  opts: { groupBy: UtilizationGroupBy; dimension: UtilizationDimension },
): UtilizationResult {
  const bucketFn = opts.groupBy === "week" ? weekBucket : monthBucket;
  const rows = new Map<string, UtilizationRow>();
  let sumBillable = 0;
  let sumNon = 0;

  for (const e of entries) {
    const hrs = e.minutes / 60;
    const billable = classifyBillable(e);
    if (billable) sumBillable += hrs;
    else sumNon += hrs;

    const bucket = bucketFn(e.date);
    const { key: dimKey, label } = dimensionKey(e, opts.dimension);
    const compoundKey = `${bucket.key}::${dimKey}`;

    const row = rows.get(compoundKey) ?? {
      key: compoundKey,
      label,
      period: bucket.key,
      periodLabel: bucket.label,
      billableHours: 0,
      nonBillableHours: 0,
      totalHours: 0,
      utilizationPct: 0,
    };
    if (billable) row.billableHours += hrs;
    else row.nonBillableHours += hrs;
    row.totalHours += hrs;
    rows.set(compoundKey, row);
  }

  const rowList = Array.from(rows.values())
    .map((r) => ({ ...r, utilizationPct: pct(r.billableHours, r.totalHours) }))
    .sort((a, b) => {
      if (a.period < b.period) return -1;
      if (a.period > b.period) return 1;
      if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
      return a.label.localeCompare(b.label);
    });

  const total = sumBillable + sumNon;
  return {
    groupBy: opts.groupBy,
    dimension: opts.dimension,
    rows: rowList,
    summary: {
      billableHours: sumBillable,
      nonBillableHours: sumNon,
      totalHours: total,
      utilizationPct: pct(sumBillable, total),
    },
  };
}

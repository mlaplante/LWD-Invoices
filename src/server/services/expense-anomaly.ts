/**
 * Expense anomaly detection.
 *
 * Rides on the structured expense data the OCR pipeline already extracts to
 * flag two classes of problem:
 *   1. Duplicate receipts — same supplier + same amount within a tight date
 *      window (the classic "paid the same invoice twice" / double-scanned
 *      receipt case).
 *   2. Amount outliers — an expense far above the supplier's own typical
 *      spend, computed from that supplier's history (median + MAD), so the
 *      threshold adapts per vendor instead of a flat dollar cap.
 *
 * Pure function (`detectExpenseAnomalies`) — the router feeds it expenses
 * pulled from Prisma.
 */

export interface AnomalyExpense {
  id: string;
  /** Supplier key for grouping; falls back to a normalized name. */
  supplierKey: string;
  supplierName: string;
  amount: number;
  date: Date;
  description?: string | null;
}

export interface DuplicateExpenseGroup {
  type: "duplicate";
  severity: "warning" | "danger";
  supplierName: string;
  amount: number;
  /** Expense ids that look like duplicates of each other. */
  expenseIds: string[];
  message: string;
}

export interface OutlierExpense {
  type: "outlier";
  severity: "warning" | "danger";
  expenseId: string;
  supplierName: string;
  amount: number;
  /** The supplier's typical (median) amount this was compared against. */
  typicalAmount: number;
  /** How many times larger than typical. */
  multiple: number;
  message: string;
}

export interface ExpenseAnomalyReport {
  generatedAt: string;
  duplicates: DuplicateExpenseGroup[];
  outliers: OutlierExpense[];
  summary: {
    scanned: number;
    duplicateCount: number;
    outlierCount: number;
    /** Total amount tied up in suspected-duplicate expenses (excluding one kept copy per group). */
    duplicateExposure: number;
  };
}

export interface DetectExpenseAnomaliesOptions {
  now?: Date;
  /** Max days apart for two same-supplier, same-amount expenses to be a duplicate. */
  duplicateWindowDays?: number;
  /** An expense is an outlier when amount >= median * this multiple (and above MAD band). */
  outlierMultiple?: number;
  /** Minimum expenses for a supplier before outlier detection applies. */
  minHistoryForOutliers?: number;
}

const DAY_MS = 86_400_000;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function detectDuplicates(
  expenses: AnomalyExpense[],
  windowDays: number,
): DuplicateExpenseGroup[] {
  // Group by supplier + amount (rounded to cents), then cluster entries whose
  // dates fall within the window of each other.
  const byKey = new Map<string, AnomalyExpense[]>();
  for (const exp of expenses) {
    const key = `${exp.supplierKey}::${round(exp.amount)}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(exp);
    byKey.set(key, bucket);
  }

  const groups: DuplicateExpenseGroup[] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort((a, b) => a.date.getTime() - b.date.getTime());
    let cluster: AnomalyExpense[] = [sorted[0]];
    const flushes: AnomalyExpense[][] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i].date.getTime() - cluster[cluster.length - 1].date.getTime()) / DAY_MS;
      if (gap <= windowDays) {
        cluster.push(sorted[i]);
      } else {
        flushes.push(cluster);
        cluster = [sorted[i]];
      }
    }
    flushes.push(cluster);

    for (const c of flushes) {
      if (c.length < 2) continue;
      const sameDay = c.every(
        (e) => e.date.toISOString().slice(0, 10) === c[0].date.toISOString().slice(0, 10),
      );
      groups.push({
        type: "duplicate",
        severity: sameDay ? "danger" : "warning",
        supplierName: c[0].supplierName,
        amount: round(c[0].amount),
        expenseIds: c.map((e) => e.id),
        message: `${c.length} expenses of $${round(c[0].amount).toLocaleString("en-US")} from ${c[0].supplierName}${sameDay ? " on the same day" : ` within ${windowDays} days`} — possible duplicate.`,
      });
    }
  }
  return groups;
}

function detectOutliers(
  expenses: AnomalyExpense[],
  multipleThreshold: number,
  minHistory: number,
): OutlierExpense[] {
  const bySupplier = new Map<string, AnomalyExpense[]>();
  for (const exp of expenses) {
    const bucket = bySupplier.get(exp.supplierKey) ?? [];
    bucket.push(exp);
    bySupplier.set(exp.supplierKey, bucket);
  }

  const outliers: OutlierExpense[] = [];
  for (const bucket of bySupplier.values()) {
    if (bucket.length < minHistory) continue;
    const amounts = bucket.map((e) => e.amount);
    const med = median(amounts);
    if (med <= 0) continue;
    // Median absolute deviation guards against flagging when spend is naturally
    // spread out (a high-variance supplier shouldn't trip on every large item).
    const mad = median(amounts.map((a) => Math.abs(a - med)));
    const band = med + Math.max(mad * 3, med * 0.5);

    for (const exp of bucket) {
      if (exp.amount >= med * multipleThreshold && exp.amount > band) {
        const multiple = round(exp.amount / med);
        outliers.push({
          type: "outlier",
          severity: multiple >= multipleThreshold * 2 ? "danger" : "warning",
          expenseId: exp.id,
          supplierName: exp.supplierName,
          amount: round(exp.amount),
          typicalAmount: round(med),
          multiple,
          message: `$${round(exp.amount).toLocaleString("en-US")} from ${exp.supplierName} is ${multiple}× the typical $${round(med).toLocaleString("en-US")} — review before paying.`,
        });
      }
    }
  }
  return outliers.sort((a, b) => b.multiple - a.multiple);
}

export function detectExpenseAnomalies(
  expenses: AnomalyExpense[],
  options: DetectExpenseAnomaliesOptions = {},
): ExpenseAnomalyReport {
  const now = options.now ?? new Date();
  const windowDays = options.duplicateWindowDays ?? 7;
  const outlierMultiple = options.outlierMultiple ?? 3;
  const minHistory = options.minHistoryForOutliers ?? 4;

  const duplicates = detectDuplicates(expenses, windowDays);
  const outliers = detectOutliers(expenses, outlierMultiple, minHistory);

  // Exposure = the redundant copies (every duplicate beyond the first per group).
  const duplicateExposure = round(
    duplicates.reduce((sum, g) => sum + g.amount * (g.expenseIds.length - 1), 0),
  );

  return {
    generatedAt: now.toISOString(),
    duplicates,
    outliers,
    summary: {
      scanned: expenses.length,
      duplicateCount: duplicates.length,
      outlierCount: outliers.length,
      duplicateExposure,
    },
  };
}

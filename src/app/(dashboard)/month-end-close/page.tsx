import { api, HydrateClient } from "@/trpc/server";
import { MonthEndClose } from "@/components/close/MonthEndClose";

export const metadata = { title: "Month-end close" };
export const dynamic = "force-dynamic";

/**
 * Mirrors `recentClosablePeriods()` in MonthEndClose.tsx (the last fully-elapsed
 * month relative to "now") so the prefetched input matches the client's default
 * `useState` selection on first render. Duplicated rather than imported because
 * that function lives in a "use client" component we're told not to modify.
 */
function defaultPeriod(now = new Date()): { year: number; month: number } {
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-11 → previous month in 1-12 terms
  if (m === 0) {
    y -= 1;
    m = 12;
  }
  return { year: y, month: m };
}

export default async function MonthEndClosePage() {
  const { year, month } = defaultPeriod();
  void api.monthEndClose.preview.prefetch({ year, month });

  return (
    <HydrateClient>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Month-end close</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            The close agent reconciles the month, flags anomalies, and drafts adjusting entries —
            then presents a one-click close for your approval. Closing freezes a snapshot and locks
            the period; you can reopen it any time.
          </p>
        </div>
        <MonthEndClose />
      </div>
    </HydrateClient>
  );
}

/**
 * Forecast accuracy — pure grading of matured ForecastSnapshots.
 *
 * Each snapshot froze "collections we expect within N days"; once the window
 * closes, actual payments received are compared against it. Per-snapshot we
 * report an accuracy score; across history we report mean accuracy and BIAS
 * (the signed average error), which is the actionable number — a persistent
 * negative bias means the forecast over-promises cash and runway numbers
 * should be read more conservatively.
 */

export type ScoredSnapshot = {
  capturedAt: Date;
  horizonDays: number;
  projectedInflow: number;
  actualInflow: number;
};

export type SnapshotScore = {
  /** actual − projected (negative = collected less than forecast). */
  errorAmount: number;
  /** |error| as % of projected (capped at 999 to keep tiny projections sane). */
  pctError: number;
  /** 0–100; 100 = spot on. */
  accuracy: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scoreSnapshot(projected: number, actual: number): SnapshotScore {
  const errorAmount = round2(actual - projected);
  if (projected <= 0) {
    // Nothing was forecast: perfectly accurate only if nothing arrived.
    const pctError = actual > 0 ? 100 : 0;
    return { errorAmount, pctError, accuracy: actual > 0 ? 0 : 100 };
  }
  const pctError = Math.min(round2((Math.abs(errorAmount) / projected) * 100), 999);
  const accuracy = Math.max(0, round2(100 - pctError));
  return { errorAmount, pctError, accuracy };
}

export type HorizonAccuracy = {
  horizonDays: number;
  sampleCount: number;
  meanAccuracy: number;
  /** Mean signed error as % of projected. Negative = forecast ran hot. */
  meanBiasPct: number;
  biasDirection: "over-forecasting" | "under-forecasting" | "on-target";
};

export type AccuracySummary = {
  horizons: HorizonAccuracy[];
  overallAccuracy: number | null;
  sampleCount: number;
};

const BIAS_TOLERANCE_PCT = 5;

export function summarizeAccuracy(snapshots: ScoredSnapshot[]): AccuracySummary {
  const byHorizon = new Map<number, ScoredSnapshot[]>();
  for (const snap of snapshots) {
    const list = byHorizon.get(snap.horizonDays) ?? [];
    list.push(snap);
    byHorizon.set(snap.horizonDays, list);
  }

  const horizons: HorizonAccuracy[] = [...byHorizon.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([horizonDays, snaps]) => {
      const scores = snaps.map((s) => ({
        score: scoreSnapshot(s.projectedInflow, s.actualInflow),
        snap: s,
      }));
      const meanAccuracy = round2(
        scores.reduce((sum, s) => sum + s.score.accuracy, 0) / scores.length,
      );
      // Signed bias, weighted as % of projected per snapshot (skip zero projections).
      const biased = scores.filter((s) => s.snap.projectedInflow > 0);
      const meanBiasPct =
        biased.length > 0
          ? round2(
              biased.reduce(
                (sum, s) => sum + (s.score.errorAmount / s.snap.projectedInflow) * 100,
                0,
              ) / biased.length,
            )
          : 0;
      const biasDirection: HorizonAccuracy["biasDirection"] =
        meanBiasPct < -BIAS_TOLERANCE_PCT
          ? "over-forecasting"
          : meanBiasPct > BIAS_TOLERANCE_PCT
            ? "under-forecasting"
            : "on-target";
      return { horizonDays, sampleCount: snaps.length, meanAccuracy, meanBiasPct, biasDirection };
    });

  const overallAccuracy =
    snapshots.length > 0
      ? round2(
          snapshots
            .map((s) => scoreSnapshot(s.projectedInflow, s.actualInflow).accuracy)
            .reduce((a, b) => a + b, 0) / snapshots.length,
        )
      : null;

  return { horizons, overallAccuracy, sampleCount: snapshots.length };
}

/** Human framing of the dominant bias for the hub UI. */
export function describeBias(summary: AccuracySummary): string | null {
  if (summary.sampleCount === 0) return null;
  const weighted = summary.horizons.filter((h) => h.sampleCount > 0);
  if (weighted.length === 0) return null;
  const meanBias =
    weighted.reduce((sum, h) => sum + h.meanBiasPct * h.sampleCount, 0) /
    weighted.reduce((sum, h) => sum + h.sampleCount, 0);
  if (meanBias < -BIAS_TOLERANCE_PCT) {
    return `On average you collect ${Math.abs(Math.round(meanBias))}% less than forecast — read projected cash conservatively.`;
  }
  if (meanBias > BIAS_TOLERANCE_PCT) {
    return `On average you collect ${Math.round(meanBias)}% more than forecast — the projection runs conservative.`;
  }
  return "Forecasts have tracked actual collections closely.";
}

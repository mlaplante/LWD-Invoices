import { describe, it, expect } from "vitest";
import {
  describeBias,
  scoreSnapshot,
  summarizeAccuracy,
  type ScoredSnapshot,
} from "@/server/services/forecast-accuracy";

function snap(horizonDays: number, projected: number, actual: number): ScoredSnapshot {
  return {
    capturedAt: new Date("2026-03-01T00:00:00Z"),
    horizonDays,
    projectedInflow: projected,
    actualInflow: actual,
  };
}

describe("scoreSnapshot", () => {
  it("scores a perfect forecast at 100", () => {
    expect(scoreSnapshot(1000, 1000)).toEqual({ errorAmount: 0, pctError: 0, accuracy: 100 });
  });

  it("reports signed error and symmetric accuracy", () => {
    const under = scoreSnapshot(1000, 800);
    expect(under.errorAmount).toBe(-200);
    expect(under.pctError).toBe(20);
    expect(under.accuracy).toBe(80);

    const over = scoreSnapshot(1000, 1200);
    expect(over.errorAmount).toBe(200);
    expect(over.accuracy).toBe(80);
  });

  it("floors accuracy at 0 for wild misses", () => {
    expect(scoreSnapshot(100, 500).accuracy).toBe(0);
    expect(scoreSnapshot(100, 500).pctError).toBe(400);
  });

  it("handles zero-projection snapshots", () => {
    expect(scoreSnapshot(0, 0).accuracy).toBe(100);
    expect(scoreSnapshot(0, 250).accuracy).toBe(0);
  });
});

describe("summarizeAccuracy", () => {
  it("returns an empty summary for no samples", () => {
    const summary = summarizeAccuracy([]);
    expect(summary.sampleCount).toBe(0);
    expect(summary.overallAccuracy).toBeNull();
    expect(summary.horizons).toEqual([]);
  });

  it("groups by horizon, sorted ascending", () => {
    const summary = summarizeAccuracy([
      snap(90, 3000, 2700),
      snap(30, 1000, 950),
      snap(30, 1000, 1050),
    ]);
    expect(summary.horizons.map((h) => h.horizonDays)).toEqual([30, 90]);
    expect(summary.horizons[0].sampleCount).toBe(2);
    expect(summary.horizons[0].meanAccuracy).toBe(95);
    // +5% and −5% cancel out → on target.
    expect(summary.horizons[0].meanBiasPct).toBe(0);
    expect(summary.horizons[0].biasDirection).toBe("on-target");
  });

  it("flags persistent over-forecasting", () => {
    const summary = summarizeAccuracy([
      snap(30, 1000, 800),
      snap(30, 2000, 1700),
      snap(30, 1500, 1300),
    ]);
    expect(summary.horizons[0].biasDirection).toBe("over-forecasting");
    expect(summary.horizons[0].meanBiasPct).toBeLessThan(-5);
  });

  it("flags under-forecasting when collections beat the forecast", () => {
    const summary = summarizeAccuracy([snap(60, 1000, 1300), snap(60, 1000, 1200)]);
    expect(summary.horizons[0].biasDirection).toBe("under-forecasting");
  });
});

describe("describeBias", () => {
  it("is null with no samples", () => {
    expect(describeBias(summarizeAccuracy([]))).toBeNull();
  });

  it("warns to read cash conservatively when forecasts run hot", () => {
    const note = describeBias(
      summarizeAccuracy([snap(30, 1000, 750), snap(60, 2000, 1500)]),
    );
    expect(note).toMatch(/less than forecast/);
  });

  it("celebrates a tight forecast", () => {
    const note = describeBias(summarizeAccuracy([snap(30, 1000, 990)]));
    expect(note).toMatch(/closely/);
  });
});

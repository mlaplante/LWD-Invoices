import { describe, it, expect } from "vitest";
import {
  recommendSendWindow,
  type SendObservation,
} from "@/server/services/send-timing";

function obs(overrides: Partial<SendObservation> = {}): SendObservation {
  return { weekday: 2, hour: 9, hoursToOpen: 2, ...overrides };
}

describe("recommendSendWindow — thin history", () => {
  it("falls back to a global default when there are too few observations", () => {
    const rec = recommendSendWindow([obs(), obs()]);
    expect(rec.basis).toBe("default");
    expect(rec.confidence).toBe("low");
  });

  it("falls back to a default for an empty history", () => {
    const rec = recommendSendWindow([]);
    expect(rec.basis).toBe("default");
    expect(rec.sampleSize).toBe(0);
  });
});

describe("recommendSendWindow — learned from history", () => {
  it("recommends the weekday with the best open behaviour", () => {
    // Tuesday opens fast and reliably; Friday is mostly ignored.
    const observations: SendObservation[] = [
      ...Array.from({ length: 6 }, () => obs({ weekday: 2, hour: 9, hoursToOpen: 1 })),
      ...Array.from({ length: 6 }, () => obs({ weekday: 5, hour: 9, hoursToOpen: null })),
    ];
    const rec = recommendSendWindow(observations);
    expect(rec.basis).toBe("history");
    expect(rec.weekday).toBe(2);
    expect(rec.weekdayLabel).toBe("Tuesday");
  });

  it("recommends a time-of-day bucket from the send hour", () => {
    const observations = Array.from({ length: 8 }, () => obs({ weekday: 3, hour: 8, hoursToOpen: 1 }));
    const rec = recommendSendWindow(observations);
    expect(rec.timeOfDay).toBe("morning");
  });

  it("reports higher confidence with a larger sample", () => {
    const few = recommendSendWindow(Array.from({ length: 6 }, () => obs({ hoursToOpen: 1 })));
    const many = recommendSendWindow(Array.from({ length: 25 }, () => obs({ hoursToOpen: 1 })));
    expect(few.confidence).toBe("low");
    expect(many.confidence).toBe("high");
  });

  it("includes the sample size it learned from", () => {
    const rec = recommendSendWindow(Array.from({ length: 10 }, () => obs({ hoursToOpen: 1 })));
    expect(rec.sampleSize).toBe(10);
  });
});

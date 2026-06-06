import { describe, it, expect } from "vitest";
import { getViewedUnpaidStepDue } from "@/inngest/functions/reminder-sequences";

describe("getViewedUnpaidStepDue", () => {
  const now = new Date("2026-06-06T12:00:00Z");

  it("returns null when the invoice was never opened", () => {
    const steps = [{ id: "s1", viewedDelayHours: 24 }];
    expect(getViewedUnpaidStepDue(now, null, steps, new Set())).toBeNull();
    expect(getViewedUnpaidStepDue(now, undefined, steps, new Set())).toBeNull();
  });

  it("returns null when not enough time has elapsed since the open", () => {
    const openedAt = new Date("2026-06-06T06:00:00Z"); // 6h ago
    const steps = [{ id: "s1", viewedDelayHours: 24 }];
    expect(getViewedUnpaidStepDue(now, openedAt, steps, new Set())).toBeNull();
  });

  it("fires once the delay window has elapsed", () => {
    const openedAt = new Date("2026-06-05T06:00:00Z"); // 30h ago
    const steps = [{ id: "s1", viewedDelayHours: 24 }];
    expect(getViewedUnpaidStepDue(now, openedAt, steps, new Set())?.id).toBe("s1");
  });

  it("treats the elapsed time as inclusive of the delay boundary", () => {
    const openedAt = new Date("2026-06-05T12:00:00Z"); // exactly 24h ago
    const steps = [{ id: "s1", viewedDelayHours: 24 }];
    expect(getViewedUnpaidStepDue(now, openedAt, steps, new Set())?.id).toBe("s1");
  });

  it("defaults to a 24h delay when viewedDelayHours is null", () => {
    const recent = new Date("2026-06-06T06:00:00Z"); // 6h ago — below default
    const old = new Date("2026-06-05T06:00:00Z"); // 30h ago — above default
    const steps = [{ id: "s1", viewedDelayHours: null }];
    expect(getViewedUnpaidStepDue(now, recent, steps, new Set())).toBeNull();
    expect(getViewedUnpaidStepDue(now, old, steps, new Set())?.id).toBe("s1");
  });

  it("skips steps already sent", () => {
    const openedAt = new Date("2026-06-05T06:00:00Z"); // 30h ago
    const steps = [{ id: "s1", viewedDelayHours: 24 }];
    expect(getViewedUnpaidStepDue(now, openedAt, steps, new Set(["s1"]))).toBeNull();
  });

  it("returns the smallest-delay eligible step first (drips one per run)", () => {
    const openedAt = new Date("2026-06-04T12:00:00Z"); // 48h ago
    const steps = [
      { id: "later", viewedDelayHours: 24 },
      { id: "earlier", viewedDelayHours: 6 },
    ];
    // Both are eligible at 48h; the smaller delay wins first.
    expect(getViewedUnpaidStepDue(now, openedAt, steps, new Set())?.id).toBe("earlier");
    // Once the earlier one is logged, the next run picks the later one.
    expect(getViewedUnpaidStepDue(now, openedAt, steps, new Set(["earlier"]))?.id).toBe("later");
  });

  it("returns null when there are no viewed steps", () => {
    const openedAt = new Date("2026-06-05T06:00:00Z");
    expect(getViewedUnpaidStepDue(now, openedAt, [], new Set())).toBeNull();
  });
});

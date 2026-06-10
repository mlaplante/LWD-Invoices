import { describe, expect, it } from "vitest";
import { nextSendWindowOccurrence } from "@/server/services/send-timing";

// Fixed reference points (2026-06-09 is a Tuesday, 2026-06-10 a Wednesday).
const TUESDAY = 2;

describe("nextSendWindowOccurrence", () => {
  it("returns the next matching weekday at the window's representative hour (UTC org)", () => {
    // Wednesday → following Tuesday 9:00 UTC morning.
    const from = new Date("2026-06-10T12:00:00.000Z");
    const result = nextSendWindowOccurrence(
      { weekday: TUESDAY, timeOfDay: "morning" },
      "UTC",
      from,
    );
    expect(result.toISOString()).toBe("2026-06-16T09:00:00.000Z");
  });

  it("uses the same day when the window is still ahead", () => {
    // Tuesday 7:00 UTC, morning window (9:00) hasn't passed yet.
    const from = new Date("2026-06-09T07:00:00.000Z");
    const result = nextSendWindowOccurrence(
      { weekday: TUESDAY, timeOfDay: "morning" },
      "UTC",
      from,
    );
    expect(result.toISOString()).toBe("2026-06-09T09:00:00.000Z");
  });

  it("rolls to next week when today's window already passed", () => {
    const from = new Date("2026-06-09T10:00:00.000Z");
    const result = nextSendWindowOccurrence(
      { weekday: TUESDAY, timeOfDay: "morning" },
      "UTC",
      from,
    );
    expect(result.toISOString()).toBe("2026-06-16T09:00:00.000Z");
  });

  it("computes the window hour in the org's time zone", () => {
    // Tuesday 8:00 AM PDT (15:00 UTC): the 9:00 AM PDT morning window is
    // still ahead → same day, 16:00 UTC.
    const from = new Date("2026-06-09T15:00:00.000Z");
    const result = nextSendWindowOccurrence(
      { weekday: TUESDAY, timeOfDay: "morning" },
      "America/Los_Angeles",
      from,
    );
    expect(result.toISOString()).toBe("2026-06-09T16:00:00.000Z");
  });

  it("respects the org zone's calendar day, not UTC's", () => {
    // 2026-06-10T02:00Z is still Tuesday evening (7 PM) in Los Angeles, but
    // the 6 PM evening window has passed → next Tuesday 6 PM PDT (Jun 17, 01:00Z).
    const from = new Date("2026-06-10T02:00:00.000Z");
    const result = nextSendWindowOccurrence(
      { weekday: TUESDAY, timeOfDay: "evening" },
      "America/Los_Angeles",
      from,
    );
    expect(result.toISOString()).toBe("2026-06-17T01:00:00.000Z");
  });

  it("supports afternoon and evening representative hours", () => {
    const from = new Date("2026-06-10T12:00:00.000Z"); // Wednesday noon UTC
    const afternoon = nextSendWindowOccurrence(
      { weekday: 3, timeOfDay: "afternoon" },
      "UTC",
      from,
    );
    expect(afternoon.toISOString()).toBe("2026-06-10T14:00:00.000Z");

    const evening = nextSendWindowOccurrence(
      { weekday: 3, timeOfDay: "evening" },
      "UTC",
      from,
    );
    expect(evening.toISOString()).toBe("2026-06-10T18:00:00.000Z");
  });
});

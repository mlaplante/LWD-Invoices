import { describe, it, expect } from "vitest";
import { roundMinutes } from "@/server/services/time-rounding";

describe("roundMinutes", () => {
  it("returns raw minutes when interval is 0 (disabled)", () => {
    expect(roundMinutes(45, 0)).toBe(45);
  });

  it("returns 0 for 0 minutes regardless of interval", () => {
    expect(roundMinutes(0, 15)).toBe(0);
  });

  it("rounds up to the nearest bucket", () => {
    expect(roundMinutes(7, 15)).toBe(15);
  });

  it("passes through an exact multiple unchanged", () => {
    expect(roundMinutes(15, 15)).toBe(15);
    expect(roundMinutes(30, 15)).toBe(30);
  });

  it("rounds up when just over a multiple", () => {
    expect(roundMinutes(16, 15)).toBe(30);
    expect(roundMinutes(31, 15)).toBe(45);
  });

  it("handles 60-minute interval", () => {
    expect(roundMinutes(61, 60)).toBe(120);
    expect(roundMinutes(60, 60)).toBe(60);
  });

  it("handles 6-minute interval", () => {
    expect(roundMinutes(4, 6)).toBe(6);
    expect(roundMinutes(6, 6)).toBe(6);
    expect(roundMinutes(7, 6)).toBe(12);
  });
});

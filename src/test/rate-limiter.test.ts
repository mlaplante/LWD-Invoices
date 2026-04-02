import { describe, it, expect, beforeEach, vi } from "vitest";
import { isRateLimited, clearRateLimits } from "@/app/api/v1/auth";

describe("isRateLimited", () => {
  beforeEach(() => {
    clearRateLimits();
    vi.useRealTimers();
  });

  it("allows the first request for a token", () => {
    expect(isRateLimited("tok-first")).toBe(false);
  });

  it("allows exactly 60 requests (the limit)", () => {
    for (let i = 0; i < 59; i++) isRateLimited("tok-limit");
    expect(isRateLimited("tok-limit")).toBe(false); // 60th request
  });

  it("blocks the 61st request within the window", () => {
    for (let i = 0; i < 60; i++) isRateLimited("tok-block");
    expect(isRateLimited("tok-block")).toBe(true); // 61st
  });

  it("counts tokens independently", () => {
    for (let i = 0; i < 60; i++) isRateLimited("tok-a");
    expect(isRateLimited("tok-b")).toBe(false);
  });

  it("does not count timestamps outside the sliding window", () => {
    vi.useFakeTimers();
    const token = "tok-window";
    for (let i = 0; i < 60; i++) isRateLimited(token);
    expect(isRateLimited(token)).toBe(true); // blocked at 61st
    vi.advanceTimersByTime(60_001); // advance past the 1-minute window
    expect(isRateLimited(token)).toBe(false); // old timestamps expired
    vi.useRealTimers();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter, createLockoutTracker } from "@/lib/rate-limit";
import { generateSecureToken } from "@/lib/secure-token";
import { generatePortalToken } from "@/lib/portal-session";

afterEach(() => {
  vi.useRealTimers();
});

describe("createRateLimiter key cap", () => {
  it("bounds tracked keys so unique-key floods can't grow memory unbounded", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 100 });
    // Flood with unique keys well past the cap — should not throw and the
    // limiter should still enforce limits for fresh keys afterwards.
    for (let i = 0; i < 1_000; i++) limiter.isLimited(`flood-${i}`);
    for (let i = 0; i < 5; i++) expect(limiter.isLimited("victim")).toBe(false);
    expect(limiter.isLimited("victim")).toBe(true);
  });

  it("prunes expired keys before evicting live ones", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, maxKeys: 10 });
    for (let i = 0; i < 9; i++) limiter.isLimited(`old-${i}`);
    vi.advanceTimersByTime(2_000); // old keys expire
    for (let i = 0; i < 20; i++) limiter.isLimited(`new-${i}`);
    expect(limiter.isLimited("fresh")).toBe(false);
  });
});

describe("createLockoutTracker", () => {
  it("is not locked out before maxFailures", () => {
    const lockout = createLockoutTracker({ maxFailures: 5, lockoutMs: 60_000 });
    for (let i = 0; i < 4; i++) lockout.recordFailure("key");
    expect(lockout.retryAfterSeconds("key")).toBeNull();
  });

  it("locks out after maxFailures and reports retry-after seconds", () => {
    const lockout = createLockoutTracker({ maxFailures: 5, lockoutMs: 60_000 });
    for (let i = 0; i < 5; i++) lockout.recordFailure("key");
    const retryAfter = lockout.retryAfterSeconds("key");
    expect(retryAfter).not.toBeNull();
    expect(retryAfter!).toBeGreaterThan(0);
    expect(retryAfter!).toBeLessThanOrEqual(60);
  });

  it("unlocks after the lockout window passes", () => {
    vi.useFakeTimers();
    const lockout = createLockoutTracker({ maxFailures: 3, lockoutMs: 10_000 });
    for (let i = 0; i < 3; i++) lockout.recordFailure("key");
    expect(lockout.retryAfterSeconds("key")).not.toBeNull();
    vi.advanceTimersByTime(10_001);
    expect(lockout.retryAfterSeconds("key")).toBeNull();
  });

  it("reset clears the failure streak", () => {
    const lockout = createLockoutTracker({ maxFailures: 3, lockoutMs: 10_000 });
    for (let i = 0; i < 3; i++) lockout.recordFailure("key");
    lockout.reset("key");
    expect(lockout.retryAfterSeconds("key")).toBeNull();
  });

  it("tracks keys independently and bounds memory under unique-key floods", () => {
    const lockout = createLockoutTracker({ maxFailures: 2, lockoutMs: 60_000, maxKeys: 50 });
    for (let i = 0; i < 500; i++) lockout.recordFailure(`flood-${i}`);
    // A fresh key still starts from zero failures.
    lockout.recordFailure("fresh");
    expect(lockout.retryAfterSeconds("fresh")).toBeNull();
  });
});

describe("secure token generation", () => {
  it("generates 64-char hex tokens (256 bits of entropy)", () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generatePortalToken delegates to the same generator", () => {
    expect(generatePortalToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never repeats across many generations", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i++) seen.add(generateSecureToken());
    expect(seen.size).toBe(1_000);
  });
});

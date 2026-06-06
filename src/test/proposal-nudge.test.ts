import { describe, it, expect } from "vitest";
import { isProposalNudgeDue } from "@/inngest/functions/proposal-nudges";

describe("isProposalNudgeDue", () => {
  const now = new Date("2026-06-06T12:00:00Z");

  it("returns false when the proposal was never opened", () => {
    expect(isProposalNudgeDue(now, null, 48, false)).toBe(false);
    expect(isProposalNudgeDue(now, undefined, 48, false)).toBe(false);
  });

  it("returns false when not enough time has elapsed since the open", () => {
    const openedAt = new Date("2026-06-06T06:00:00Z"); // 6h ago, delay 48h
    expect(isProposalNudgeDue(now, openedAt, 48, false)).toBe(false);
  });

  it("fires once the delay window has elapsed", () => {
    const openedAt = new Date("2026-06-04T06:00:00Z"); // 54h ago
    expect(isProposalNudgeDue(now, openedAt, 48, false)).toBe(true);
  });

  it("treats the elapsed time as inclusive of the delay boundary", () => {
    const openedAt = new Date("2026-06-04T12:00:00Z"); // exactly 48h ago
    expect(isProposalNudgeDue(now, openedAt, 48, false)).toBe(true);
  });

  it("never fires twice — already-nudged proposals are skipped", () => {
    const openedAt = new Date("2026-06-04T06:00:00Z"); // 54h ago, well past delay
    expect(isProposalNudgeDue(now, openedAt, 48, true)).toBe(false);
  });

  it("respects a custom (shorter) delay", () => {
    const openedAt = new Date("2026-06-06T06:00:00Z"); // 6h ago
    expect(isProposalNudgeDue(now, openedAt, 4, false)).toBe(true);
    expect(isProposalNudgeDue(now, openedAt, 12, false)).toBe(false);
  });
});

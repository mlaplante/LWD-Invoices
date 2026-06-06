import { describe, it, expect } from "vitest";
import { normalizeDisputeStatus } from "@/server/services/disputes";
import { mapStripeRefundStatus } from "@/server/services/refunds";
import { DisputeStatus, RefundStatus } from "@/generated/prisma";

describe("normalizeDisputeStatus", () => {
  it("maps needs_response variants to NEEDS_RESPONSE", () => {
    expect(normalizeDisputeStatus("needs_response")).toBe(DisputeStatus.NEEDS_RESPONSE);
    expect(normalizeDisputeStatus("warning_needs_response")).toBe(DisputeStatus.NEEDS_RESPONSE);
  });

  it("maps review variants to UNDER_REVIEW", () => {
    expect(normalizeDisputeStatus("under_review")).toBe(DisputeStatus.UNDER_REVIEW);
    expect(normalizeDisputeStatus("warning_under_review")).toBe(DisputeStatus.UNDER_REVIEW);
  });

  it("maps terminal outcomes", () => {
    expect(normalizeDisputeStatus("won")).toBe(DisputeStatus.WON);
    expect(normalizeDisputeStatus("lost")).toBe(DisputeStatus.LOST);
    expect(normalizeDisputeStatus("warning_closed")).toBe(DisputeStatus.WARNING_CLOSED);
    expect(normalizeDisputeStatus("charge_refunded")).toBe(DisputeStatus.CHARGE_REFUNDED);
  });

  it("falls back to CLOSED for unknown statuses", () => {
    expect(normalizeDisputeStatus("some_future_status")).toBe(DisputeStatus.CLOSED);
  });
});

describe("mapStripeRefundStatus", () => {
  it("maps succeeded/failed/canceled directly", () => {
    expect(mapStripeRefundStatus("succeeded")).toBe(RefundStatus.SUCCEEDED);
    expect(mapStripeRefundStatus("failed")).toBe(RefundStatus.FAILED);
    expect(mapStripeRefundStatus("canceled")).toBe(RefundStatus.CANCELED);
  });

  it("treats pending/requires_action/null as PENDING", () => {
    expect(mapStripeRefundStatus("pending")).toBe(RefundStatus.PENDING);
    expect(mapStripeRefundStatus("requires_action")).toBe(RefundStatus.PENDING);
    expect(mapStripeRefundStatus(null)).toBe(RefundStatus.PENDING);
    expect(mapStripeRefundStatus(undefined)).toBe(RefundStatus.PENDING);
  });
});

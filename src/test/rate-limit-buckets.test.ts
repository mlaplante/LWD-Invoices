import { describe, it, expect } from "vitest";
import { getBucketForPath } from "@/lib/rate-limiter";

describe("getBucketForPath", () => {
  it("buckets portal pages AND the portal API routes together", () => {
    expect(getBucketForPath("/portal/tok123")).toBe("portal");
    // The brute-forceable passphrase endpoint lives under /api/portal
    expect(getBucketForPath("/api/portal/tok123/auth")).toBe("portal");
    expect(getBucketForPath("/api/portal/dashboard/ctok/auth")).toBe("portal");
    expect(getBucketForPath("/api/portal/request-passphrase-reset")).toBe("portal");
  });

  it("buckets pay pages AND the pay API routes together", () => {
    expect(getBucketForPath("/pay/tok123")).toBe("pay");
    // Card charging lives under /api/pay
    expect(getBucketForPath("/api/pay/tok123/charge-saved")).toBe("pay");
    expect(getBucketForPath("/api/pay/tok123/stripe")).toBe("pay");
  });

  it("buckets webhooks", () => {
    expect(getBucketForPath("/api/webhooks/stripe")).toBe("webhook");
    expect(getBucketForPath("/api/webhooks/resend")).toBe("webhook");
  });

  it("buckets the v1 API", () => {
    expect(getBucketForPath("/api/v1/invoices")).toBe("apiV1");
  });

  it("buckets AI endpoints", () => {
    expect(getBucketForPath("/api/assistant/stream")).toBe("ai");
    expect(getBucketForPath("/api/expenses/receipt/ocr")).toBe("ai");
  });

  it("does not bucket the plain receipt upload as AI", () => {
    expect(getBucketForPath("/api/expenses/receipt")).toBeNull();
  });

  it("returns null for unthrottled paths", () => {
    expect(getBucketForPath("/dashboard")).toBeNull();
    expect(getBucketForPath("/api/trpc/invoices.list")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  canAutosave,
  nextAutosaveAction,
  resolveHasId,
} from "@/components/invoices/canvas/autosave-core";

describe("canAutosave", () => {
  const ok = {
    invoiceStatus: "DRAFT" as const,
    clientId: "c1",
    currencyId: "cur1",
    preflightBlocked: false,
  };
  it("allows DRAFT with client + currency and no preflight block", () => {
    expect(canAutosave(ok)).toBe(true);
  });
  it("never autosaves SENT invoices", () => {
    expect(canAutosave({ ...ok, invoiceStatus: "SENT" })).toBe(false);
  });
  it("requires a client (the meaningful-change gate)", () => {
    expect(canAutosave({ ...ok, clientId: "" })).toBe(false);
  });
  it("requires a currency", () => {
    expect(canAutosave({ ...ok, currencyId: "" })).toBe(false);
  });
  it("holds off while Stripe Tax preflight reports missing fields", () => {
    expect(canAutosave({ ...ok, preflightBlocked: true })).toBe(false);
  });
});

describe("nextAutosaveAction", () => {
  it("creates when dirty with no id and nothing in flight", () => {
    expect(nextAutosaveAction({ hasId: false, inFlight: false, dirty: true })).toBe("create");
  });
  it("updates when dirty with an id and nothing in flight", () => {
    expect(nextAutosaveAction({ hasId: true, inFlight: false, dirty: true })).toBe("update");
  });
  it("waits (queues) while a save is in flight", () => {
    expect(nextAutosaveAction({ hasId: true, inFlight: true, dirty: true })).toBe("wait");
  });
  it("does nothing when clean", () => {
    expect(nextAutosaveAction({ hasId: true, inFlight: false, dirty: false })).toBe("none");
  });
});

describe("resolveHasId", () => {
  it("is false when neither the parent id nor a pending created id exist", () => {
    expect(resolveHasId(undefined, undefined)).toBe(false);
  });
  it("is true once parent state has the invoice id", () => {
    expect(resolveHasId("inv1", undefined)).toBe(true);
  });
  it("is true from a pending created id even before parent state catches up (the queued-after-create race)", () => {
    expect(resolveHasId(undefined, "inv1")).toBe(true);
  });
  it("is true when both are present", () => {
    expect(resolveHasId("inv1", "inv1")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  canAutosave,
  nextAutosaveAction,
  resolveHasId,
  resolveSaveTarget,
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

describe("resolveSaveTarget", () => {
  it("creates in create-mode with no id anywhere", () => {
    expect(
      resolveSaveTarget({ mode: "create", refId: undefined, formId: undefined }),
    ).toEqual({ action: "create" });
  });

  it("updates using the ref id when autosave has created the draft but form.id hasn't committed yet (Critical 1)", () => {
    expect(
      resolveSaveTarget({ mode: "create", refId: "inv1", formId: undefined }),
    ).toEqual({ action: "update", id: "inv1" });
  });

  it("updates using form.id when it's the only id source available", () => {
    expect(
      resolveSaveTarget({ mode: "create", refId: undefined, formId: "inv1" }),
    ).toEqual({ action: "update", id: "inv1" });
  });

  it("updates in edit-mode when an id exists", () => {
    expect(
      resolveSaveTarget({ mode: "edit", refId: "inv1", formId: "inv1" }),
    ).toEqual({ action: "update", id: "inv1" });
  });

  it("does nothing in edit-mode with no id at all (mirrors prior behavior)", () => {
    expect(
      resolveSaveTarget({ mode: "edit", refId: undefined, formId: undefined }),
    ).toEqual({ action: "none" });
  });

  // Id-before-mode ordering only diverges from "mode gates first" when
  // mode === "create" AND an id is already present (e.g. initialData seeded
  // one). The only create-mode caller (src/app/(dashboard)/invoices/new/page.tsx)
  // never passes initialData, so this case can't occur in practice today —
  // but pin the chosen behavior (id wins) so a future create-mode caller
  // that does seed an id gets an update, not a silent duplicate-avoidance
  // regression, and so this divergence is visible if the assumption changes.
  it("prefers the id over mode even in create-mode (id-seeded create callers would update, not duplicate)", () => {
    expect(
      resolveSaveTarget({ mode: "create", refId: "seed1", formId: "seed1" }),
    ).toEqual({ action: "update", id: "seed1" });
  });
});

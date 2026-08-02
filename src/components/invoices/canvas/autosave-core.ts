export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * DRAFT-only autosave gate. clientId + currencyId are the server write
 * schema's hard requirements (both z.string().min(1)); preflightBlocked
 * mirrors the Save buttons' stripeTaxPreflight guard so autosave never
 * fires a write the server is guaranteed to reject.
 */
export function canAutosave(args: {
  invoiceStatus: "DRAFT" | "SENT";
  clientId: string;
  currencyId: string;
  preflightBlocked: boolean;
}): boolean {
  return (
    args.invoiceStatus === "DRAFT" &&
    args.clientId !== "" &&
    args.currencyId !== "" &&
    !args.preflightBlocked
  );
}

/** Single-flight scheduler decision: at most one save in flight; a change
 * arriving mid-save waits and re-fires with the latest snapshot after. */
export function nextAutosaveAction(args: {
  hasId: boolean;
  inFlight: boolean;
  dirty: boolean;
}): "create" | "update" | "wait" | "none" {
  if (!args.dirty) return "none";
  if (args.inFlight) return "wait";
  return args.hasId ? "update" : "create";
}

/**
 * Resolves whether the invoice already has a persisted id for scheduler
 * purposes. Prefers the caller's current `invoiceId` (parent state), but
 * falls back to `pendingCreatedId` — a create that has already resolved but
 * whose id hasn't propagated back into parent state yet (React state
 * updates are async, and a queued re-run can fire in the same tick as
 * `onCreated`). Without this fallback, a queued re-run right after a create
 * would see `hasId: false` and fire a second `create`, producing a
 * duplicate invoice.
 */
export function resolveHasId(
  invoiceId: string | undefined,
  pendingCreatedId: string | undefined,
): boolean {
  return Boolean(invoiceId || pendingCreatedId);
}

/**
 * Explicit-save (handleSave) target resolution. `mode` is a static page
 * prop that never changes after mount, so it cannot be used alone to decide
 * create-vs-update once autosave has already created the DRAFT out from
 * under it (autosave sets invoiceIdRef.current / form.id via
 * window.history.replaceState without remounting). Prefer `refId` — set
 * synchronously by onCreated before the corresponding setForm commits — and
 * fall back to `formId`. Only fall through to `mode === "create"` when
 * neither id source has resolved yet.
 *
 * "none" mirrors the previous behavior for `mode === "edit"` with no id at
 * all (an edit page that somehow never got an id): handleSave did nothing.
 */
export function resolveSaveTarget(args: {
  mode: "create" | "edit";
  refId: string | undefined | null;
  formId: string | undefined;
}): { action: "create" } | { action: "update"; id: string } | { action: "none" } {
  const id = args.refId ?? args.formId;
  if (id) return { action: "update", id };
  if (args.mode === "create") return { action: "create" };
  return { action: "none" };
}

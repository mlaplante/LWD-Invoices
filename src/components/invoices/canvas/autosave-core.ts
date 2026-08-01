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

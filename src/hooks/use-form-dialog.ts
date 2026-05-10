"use client";

import { useEffect } from "react";

/**
 * Reset a dialog's form state every time the dialog opens.
 *
 * Many dialogs in this app follow the same pattern:
 *   - local useState for each field
 *   - useEffect that resets them all when `open` flips true
 *
 * That second part is what this hook centralizes. Pass the open flag plus
 * a function that re-applies your initial state, and the hook fires the
 * reset on every transition into "open".
 *
 *   useFormDialogReset(open, () => {
 *     setAmount(invoiceTotal.toFixed(2));
 *     setMethod("bank_transfer");
 *     setNotes("");
 *   });
 *
 * Why a hook instead of a one-liner useEffect at every call site? It keeps
 * the dependency array honest — callers wrap their reset closure with
 * useCallback if it captures props/state, and the hook tracks `open` only.
 */
export function useFormDialogReset(open: boolean, reset: () => void): void {
  useEffect(() => {
    if (open) reset();
    // We deliberately depend on `open` only; the reset closure is the
    // caller's responsibility to memoize if it captures changing values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

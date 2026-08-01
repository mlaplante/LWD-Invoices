"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AUTOSAVE_DEBOUNCE_MS,
  canAutosave,
  nextAutosaveAction,
  type AutosaveStatus,
} from "./autosave-core";

type SaveResult = { id: string };

export function useInvoiceAutosave(opts: {
  /** Gate inputs — recomputed every render by the caller. */
  invoiceStatus: "DRAFT" | "SENT";
  clientId: string;
  currencyId: string;
  preflightBlocked: boolean;
  /** Stable-ish identity not required; read via ref. */
  invoiceId: string | undefined;
  /** JSON-serializable snapshot of everything the write payload derives from.
   * The hook autosaves whenever this string changes. */
  snapshot: string;
  doCreate: () => Promise<SaveResult>;
  doUpdate: () => Promise<SaveResult>;
  onCreated: (id: string) => void;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const runSave = useCallback(async () => {
    const o = optsRef.current;
    const dirty = lastSavedSnapshotRef.current !== o.snapshot;
    const action = nextAutosaveAction({
      hasId: Boolean(o.invoiceId),
      inFlight: inFlightRef.current,
      dirty,
    });
    if (action === "none") return;
    if (action === "wait") {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    setStatus("saving");
    const snapshotAtSave = o.snapshot;
    try {
      if (action === "create") {
        const created = await o.doCreate();
        o.onCreated(created.id);
      } else {
        await o.doUpdate();
      }
      lastSavedSnapshotRef.current = snapshotAtSave;
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        // Latest snapshot may differ from the one just saved — re-run.
        void runSave();
      }
    }
  }, []);

  useEffect(() => {
    const o = optsRef.current;
    if (
      !canAutosave({
        invoiceStatus: o.invoiceStatus,
        clientId: o.clientId,
        currencyId: o.currencyId,
        preflightBlocked: o.preflightBlocked,
      })
    ) {
      return;
    }
    if (lastSavedSnapshotRef.current === null) {
      // First render: treat the initial state as already-saved so opening an
      // existing draft (or an empty create page) never fires a write by itself.
      lastSavedSnapshotRef.current = opts.snapshot;
      return;
    }
    if (lastSavedSnapshotRef.current === opts.snapshot) return;

    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void runSave(), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [opts.snapshot, runSave]);

  const retry = useCallback(() => void runSave(), [runSave]);

  return { status, retry };
}

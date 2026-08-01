"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AUTOSAVE_DEBOUNCE_MS,
  canAutosave,
  nextAutosaveAction,
  resolveHasId,
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
  // Set the moment a create resolves, before onCreated's parent-state update
  // has committed. Covers the queued-re-run-after-create race (Critical 1):
  // a queued save firing in that gap must see "has an id" and update,
  // not create a second invoice.
  const createdIdRef = useRef<string | undefined>(undefined);

  const optsRef = useRef(opts);
  // "Latest ref" sync pattern (brief's Step 4 code, verbatim): the ref is
  // only ever read from async callbacks/effects, never during render, so
  // this write is render-pure in practice. React Compiler's static
  // analysis can't see that and flags it categorically.
  // eslint-disable-next-line react-hooks/refs -- see comment above
  optsRef.current = opts;

  // React Compiler bails on optimizing this component (the ref write above,
  // plus runSave's self-recursive call below), so it can't verify this
  // useCallback's memoization survives compilation. The `[]` deps are
  // intentional and correct — runSave only ever reads via optsRef/refs, never
  // closes over opts/props directly — so the manual memoization is safe.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- see comment above
  const runSave = useCallback(async () => {
    const o = optsRef.current;
    // Important fix: re-check the gate here, not just in the scheduling
    // effect. retry() calls runSave() directly (bypassing the effect's
    // gate check entirely), and the queued re-run below also re-enters
    // here — if clientId was cleared, status flipped to SENT, or preflight
    // now blocks, either path must bail instead of writing.
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

    const dirty = lastSavedSnapshotRef.current !== o.snapshot;
    // Critical 1 fix: OR in createdIdRef so a queued re-run that fires
    // before the parent has committed the newly-created id still resolves
    // to "update", not a second "create".
    const action = nextAutosaveAction({
      hasId: resolveHasId(o.invoiceId, createdIdRef.current),
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
        // Set before onCreated: onCreated triggers the parent state update
        // that eventually propagates into o.invoiceId, but that commit
        // hasn't happened yet — createdIdRef is what a same-tick queued
        // re-run (or doUpdate below, on the next runSave call) sees in the
        // meantime. The caller's doUpdate still closes over its own form
        // state for the actual id it sends to the server; wiring that up
        // to not race is a Task 8 concern for the real caller.
        createdIdRef.current = created.id;
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
    if (lastSavedSnapshotRef.current === null) {
      // Critical 2 fix: latch the baseline unconditionally on this first
      // effect run, BEFORE the gate check — even if the gate is currently
      // closed (e.g. no client selected yet on a fresh create page). If we
      // gated this latch, the edit that later OPENS the gate (picking a
      // client) would itself get folded into the "already saved" baseline
      // on the render where the gate turns on, and be silently dropped —
      // "pick a client, walk away" would never persist. Latching here
      // unconditionally still achieves the original goal (opening an
      // existing draft, or an empty create page, never fires a write by
      // itself), because nothing has changed yet on this very first run.
      lastSavedSnapshotRef.current = opts.snapshot;
      return;
    }
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
    if (lastSavedSnapshotRef.current === opts.snapshot) return;

    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void runSave(), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Deps include every canAutosave input, not just snapshot: preflightBlocked
    // (a tRPC query result — trpc.organization.stripeTaxPreflight.useQuery in
    // InvoiceForm.tsx) and invoiceStatus can each flip independently of any
    // form edit. Without these, a gate that opens on a preflight resolving
    // (with no accompanying snapshot change) would never re-run this effect,
    // leaving a pending edit unsaved indefinitely. The
    // `lastSavedSnapshotRef.current === opts.snapshot` guard above already
    // makes extra re-runs on unrelated dep changes a no-op, so this is safe.
  }, [
    opts.snapshot,
    opts.preflightBlocked,
    opts.invoiceStatus,
    opts.clientId,
    opts.currencyId,
    runSave,
  ]);

  const retry = useCallback(() => void runSave(), [runSave]);

  return { status, retry };
}

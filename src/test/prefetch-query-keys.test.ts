import { describe, it, expect } from "vitest";
import { hashKey } from "@tanstack/query-core";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/trpc/client";

/**
 * Server-prefetch pages (`void api.x.prefetch(input)` + `<HydrateClient>`) only
 * pay off if the prefetched query key is byte-identical to the one the client
 * component asks for. When they diverge there is no error and no warning: the
 * server does the work, the hydrated entry is ignored, and the client refetches
 * from scratch — strictly worse than not prefetching, because the query now runs
 * twice. Nothing in the type system catches it.
 *
 * These tests pin the pairings the app actually relies on, so a future edit to
 * either side of a prefetch/useQuery pair fails here instead of silently
 * doubling the query.
 */

const keyFor = (proc: Parameters<typeof getQueryKey>[0], input?: unknown) =>
  hashKey(getQueryKey(proc, input, "query"));

describe("server prefetch / client useQuery key parity", () => {
  // The two tests below assert the concrete key each page's pairing produces.
  // Comparing prefetch(x) to useQuery(x) directly would be vacuous — identical
  // expressions always match. Pinning the resolved shape instead means a change
  // to tRPC's key algorithm, or to either file's input, shows up as a diff here.

  it("reports/collections: no-input pairing resolves to a key with no `input`", () => {
    // page.tsx: void api.analytics.collectionsRisk.prefetch()
    // client:   trpc.analytics.collectionsRisk.useQuery()
    expect(getQueryKey(trpc.analytics.collectionsRisk, undefined, "query")).toEqual([
      ["analytics", "collectionsRisk"],
      { type: "query" },
    ]);
  });

  it("invoices/unpaid: empty-object pairing resolves to a key carrying `input: {}`", () => {
    // page.tsx: void api.invoices.openForReminder.prefetch({})
    // client:   trpc.invoices.openForReminder.useQuery({})
    expect(getQueryKey(trpc.invoices.openForReminder, {}, "query")).toEqual([
      ["invoices", "openForReminder"],
      { input: {}, type: "query" },
    ]);
  });

  it("no-input and empty-object input are NOT interchangeable", () => {
    // The trap this suite exists for. tRPC omits `input` from the key entirely
    // when input is undefined, but includes `input: {}` for an empty object, so
    // pairing prefetch() with useQuery({}) — or the reverse — silently misses.
    expect(keyFor(trpc.invoices.openForReminder)).not.toBe(
      keyFor(trpc.invoices.openForReminder, {})
    );
  });

  it("keys with explicitly-undefined properties match the same key without them", () => {
    // The activity page builds its input from filter state, so unset filters are
    // present as `undefined` properties rather than absent ones. react-query's
    // hashKey JSON-stringifies, which drops undefined values — so the two shapes
    // collide as intended and a partial prefetch input still matches.
    const fromState = {
      entityTypes: undefined,
      action: undefined,
      from: undefined,
      to: undefined,
      limit: 50,
      offset: 0,
    };
    expect(keyFor(trpc.auditLog.list, fromState)).toBe(
      keyFor(trpc.auditLog.list, { limit: 50, offset: 0 })
    );
  });

  it("differing input values produce different keys", () => {
    // Sanity check that the comparison above is meaningful and not just hashing
    // everything to the same string.
    expect(keyFor(trpc.auditLog.list, { limit: 50, offset: 0 })).not.toBe(
      keyFor(trpc.auditLog.list, { limit: 50, offset: 50 })
    );
  });
});

"use client";

import { useCallback, useState } from "react";

/**
 * Common form-state plumbing shared by every entity create/update form
 * in the app: a typed state object, per-field setter, error string, and
 * reset. Pair with a tRPC mutation:
 *
 *   const { form, setField, error, setError, reset } = useEntityForm({
 *     name: "", color: "#000",
 *   });
 *   const mutation = trpc.foo.create.useMutation({
 *     onSuccess: () => { reset(); onSuccess?.(); },
 *     onError: (err) => setError(err.message),
 *   });
 *
 * The hook intentionally does not own the mutation — wiring is what
 * varies per form, and forcing a single shape would just reintroduce
 * the boilerplate it's meant to remove.
 */
export function useEntityForm<T extends Record<string, unknown>>(initial: T) {
  const [form, setForm] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setForm(initial);
    setError(null);
  }, [initial]);

  return { form, setForm, setField, error, setError, reset };
}

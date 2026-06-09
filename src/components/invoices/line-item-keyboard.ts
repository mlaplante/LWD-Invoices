export type RowRef = { description: string; qty: number; rate: number; [k: string]: unknown };

export function nextFocusOnEnter(args: { rowCount: number; rowIndex: number }):
  { action: "append" | "focus"; focusRow: number } {
  const isLast = args.rowIndex >= args.rowCount - 1;
  return isLast
    ? { action: "append", focusRow: args.rowCount }
    : { action: "focus", focusRow: args.rowIndex + 1 };
}

export function duplicateRowAt<T>(rows: T[], index: number): T[] {
  if (index < 0 || index >= rows.length) return rows;
  const copy = { ...(rows[index] as object) } as T;
  return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
}

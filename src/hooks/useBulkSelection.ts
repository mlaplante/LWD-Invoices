import { useCallback, useState } from "react";
import { toggleId, toggleAll, isAllSelected, clearSelection } from "@/lib/bulk-selection";

export function useBulkSelection(allIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => setSelected((s) => toggleId(s, id)), []);
  const toggleAllIds = useCallback(() => setSelected((s) => toggleAll(s, allIds)), [allIds]);
  const clear = useCallback(() => setSelected(clearSelection()), []);
  return {
    selected,
    selectedIds: Array.from(selected),
    allSelected: isAllSelected(selected, allIds),
    someSelected: selected.size > 0,
    toggle,
    toggleAll: toggleAllIds,
    clear,
  };
}

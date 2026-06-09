export function toggleId(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function isAllSelected(selected: Set<string>, ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

export function toggleAll(selected: Set<string>, ids: string[]): Set<string> {
  return isAllSelected(selected, ids) ? new Set() : new Set(ids);
}

export function clearSelection(): Set<string> {
  return new Set();
}

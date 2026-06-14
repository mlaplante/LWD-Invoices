export const WIDGET_KEYS = [
  "summary",
  "revenue",
  "invoiceStatus",
  "expenses",
  "cashFlow",
  "topClients",
  "aging",
  "dueThisWeek",
  "estimateConversion",
  "tasks",
  "retainerBurn",
  "estimatedTax",
  "activity",
  "weeklyBriefing",
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];
export type LayoutEntry = { key: WidgetKey; visible: boolean };

export const DEFAULT_LAYOUT: LayoutEntry[] = WIDGET_KEYS.map((key) => ({ key, visible: true }));

const KEY_SET = new Set<string>(WIDGET_KEYS);

/** Drop unknown keys, keep saved order, append any missing known keys (visible) in default order. */
export function normalizeLayout(saved: Array<{ key: string; visible: boolean }>): LayoutEntry[] {
  const seen = new Set<string>();
  const kept: LayoutEntry[] = [];
  for (const entry of saved) {
    if (KEY_SET.has(entry.key) && !seen.has(entry.key)) {
      seen.add(entry.key);
      kept.push({ key: entry.key as WidgetKey, visible: !!entry.visible });
    }
  }
  for (const key of WIDGET_KEYS) {
    if (!seen.has(key)) kept.push({ key, visible: true });
  }
  return kept;
}
/**
 * Order matters: this is the default top-to-bottom order of the dashboard.
 * The briefing leads, then the stat row, then the "needs attention" queue
 * and the forecast — everything after that is supporting detail.
 *
 * Existing users keep their saved order; `normalizeLayout` appends any new
 * key at the end rather than reshuffling what they already arranged.
 */
export const WIDGET_KEYS = [
  "weeklyBriefing",
  "summary",
  "dueThisWeek",
  "cashFlow",
  "aging",
  "topClients",
  "estimatedTax",
  "revenue",
  "invoiceStatus",
  "expenses",
  "estimateConversion",
  "tasks",
  "retainerBurn",
  "activity",
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
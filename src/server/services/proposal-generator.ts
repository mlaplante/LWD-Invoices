export interface OrgItem {
  id: string;
  name: string;
  rate: number | null;
}

export interface SuggestedLineItem {
  itemId: string;
  quantity: number;
  rate: number;
}

export interface GroundedLineItem {
  itemId: string;
  name: string;
  quantity: number;
  rate: number;
}

/**
 * Grounding guard: a suggested line item may only reference a real org Item id,
 * and its rate is rewritten to the item's actual rate (the model never sets
 * prices). Fabricated item ids are dropped. This is the proposal-generator's
 * analog of the invoice fact-guard.
 */
export function groundSuggestedItems(
  suggestions: SuggestedLineItem[],
  items: OrgItem[],
): GroundedLineItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return suggestions.flatMap((s) => {
    const item = byId.get(s.itemId);
    if (!item) return [];
    return [
      {
        itemId: item.id,
        name: item.name,
        quantity: s.quantity,
        rate: item.rate ?? 0,
      },
    ];
  });
}

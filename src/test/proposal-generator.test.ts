import { describe, it, expect } from "vitest";
import {
  groundSuggestedItems,
  type OrgItem,
  type SuggestedLineItem,
} from "@/server/services/proposal-generator";

const items: OrgItem[] = [
  { id: "item-design", name: "Design", rate: 100 },
  { id: "item-dev", name: "Development", rate: 150 },
];

describe("groundSuggestedItems", () => {
  it("keeps suggestions that reference a real item id and rewrites the rate to the real one", () => {
    const out = groundSuggestedItems(
      [{ itemId: "item-design", quantity: 2, rate: 999 }],
      items,
    );
    expect(out).toEqual([{ itemId: "item-design", name: "Design", quantity: 2, rate: 100 }]);
  });

  it("drops suggestions that reference a fabricated item id", () => {
    const out = groundSuggestedItems([{ itemId: "item-ghost", quantity: 1, rate: 1 }], items);
    expect(out).toEqual([]);
  });
});

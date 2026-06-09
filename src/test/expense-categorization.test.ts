import { describe, it, expect } from "vitest";
import {
  suggestFromHistory,
  type PastExpense,
  type CategorizationSuggestion,
} from "@/server/services/expense-categorization";

const history: PastExpense[] = [
  { supplierId: "s1", categoryId: "cat-software", taxId: "t1", reimbursable: false, projectId: "p1" },
  { supplierId: "s1", categoryId: "cat-software", taxId: "t1", reimbursable: false, projectId: "p1" },
  { supplierId: "s1", categoryId: "cat-software", taxId: "t1", reimbursable: true, projectId: null },
  { supplierId: "s2", categoryId: "cat-travel", taxId: null, reimbursable: true, projectId: null },
];

describe("suggestFromHistory", () => {
  it("majority-votes category/tax/reimbursable for a known supplier", () => {
    const s = suggestFromHistory("s1", history);
    expect(s).not.toBeNull();
    expect((s as CategorizationSuggestion).categoryId).toBe("cat-software");
    expect((s as CategorizationSuggestion).taxId).toBe("t1");
    expect((s as CategorizationSuggestion).reimbursable).toBe(false); // 2 of 3
    expect((s as CategorizationSuggestion).source).toBe("history");
  });

  it("reports confidence as the winning fraction", () => {
    const s = suggestFromHistory("s1", history) as CategorizationSuggestion;
    expect(s.confidence).toBeCloseTo(1.0); // 3/3 chose cat-software
  });

  it("returns null for a supplier with no history", () => {
    expect(suggestFromHistory("unknown", history)).toBeNull();
  });
});

import { groundAiCategory, type OrgCategory } from "@/server/services/expense-categorization";

const cats: OrgCategory[] = [
  { id: "cat-software", name: "Software" },
  { id: "cat-travel", name: "Travel" },
];

describe("groundAiCategory", () => {
  it("keeps an AI category id that exists", () => {
    expect(groundAiCategory("cat-travel", cats)).toBe("cat-travel");
  });

  it("drops a fabricated AI category id", () => {
    expect(groundAiCategory("cat-made-up", cats)).toBeNull();
  });
});

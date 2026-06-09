import { describe, it, expect } from "vitest";
import {
  groundSuggestedItems,
  type OrgItem,
  type SuggestedLineItem,
} from "@/server/services/proposal-generator";
import { conformSectionKeys, type ProposalSection } from "@/server/services/proposal-generator";

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

describe("conformSectionKeys", () => {
  const template: ProposalSection[] = [
    { key: "scope", title: "Scope", content: "" },
    { key: "timeline", title: "Timeline", content: "" },
  ];

  it("keeps only generated sections whose key exists in the template, in template order", () => {
    const generated: ProposalSection[] = [
      { key: "timeline", title: "Timeline", content: "2 weeks" },
      { key: "ghost", title: "Bogus", content: "x" },
      { key: "scope", title: "Scope", content: "Build the site" },
    ];
    expect(conformSectionKeys(generated, template)).toEqual([
      { key: "scope", title: "Scope", content: "Build the site" },
      { key: "timeline", title: "Timeline", content: "2 weeks" },
    ]);
  });

  it("falls back to the template section (empty content) when the model omits one", () => {
    const generated: ProposalSection[] = [{ key: "scope", title: "Scope", content: "Build" }];
    expect(conformSectionKeys(generated, template)).toEqual([
      { key: "scope", title: "Scope", content: "Build" },
      { key: "timeline", title: "Timeline", content: "" },
    ]);
  });
});

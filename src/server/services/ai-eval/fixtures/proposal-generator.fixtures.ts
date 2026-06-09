import type { EvalCase } from "../types";
import type { ProposalGeneratorInput, ProposalGeneratorExpected } from "../graders";

const template = [
  { key: "scope", title: "Scope", content: "" },
  { key: "payment", title: "Payment Schedule", content: "" },
];
const items = [
  { id: "item-design", name: "Design", rate: 100 },
  { id: "item-dev", name: "Development", rate: 150 },
];

export const proposalGeneratorCases: EvalCase<ProposalGeneratorInput, ProposalGeneratorExpected>[] =
  [
    {
      id: "conform-section-keys",
      description: "fabricated section keys are dropped; template order is enforced",
      critical: true,
      input: {
        modelSections: [
          { key: "payment", title: "Payment Schedule", content: "50/50" },
          { key: "ghost-section", title: "Bogus", content: "x" },
          { key: "scope", title: "Scope", content: "Build the marketing site" },
        ],
        templateSections: template,
        modelItems: [],
        items,
      },
      expected: { expectSectionKeys: ["scope", "payment"], expectGroundedItemIds: [] },
    },
    {
      id: "ground-suggested-items",
      description: "CRITICAL: a fabricated itemId is dropped; a real one survives",
      critical: true,
      input: {
        modelSections: [],
        templateSections: template,
        modelItems: [
          { itemId: "item-dev", quantity: 10, rate: 150 },
          { itemId: "item-fabricated", quantity: 5, rate: 9999 },
        ],
        items,
      },
      expected: { expectSectionKeys: ["scope", "payment"], expectGroundedItemIds: ["item-dev"] },
    },
  ];

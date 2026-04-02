import type { PrismaClient } from "../../src/generated/prisma";

export const DEFAULT_SECTIONS = [
  {
    key: "executive_summary",
    title: "Executive Summary",
    content: `## Overview\n\n{{client_url}}\n\nDeveloper: Michael La Plante, La Plante Web Development\n\n{{project_type}}\n\n{{platform}}\n\n## Goals\n\n{{project_goals}}\n\n## Key Highlights\n\n- {{highlight_1}}\n- {{highlight_2}}\n- {{highlight_3}}\n- {{highlight_4}}\n- {{highlight_5}}\n\n## Current State Assessment\n\n{{current_state_assessment}}`,
  },
  {
    key: "developer_profile",
    title: "Developer Profile",
    content: `## Security-First Development\n\nSecurity is not an afterthought — it is built into every solution from the ground up. With deep roots in cybersecurity from FireEye/Mandiant, we bring a security-first mindset to every project, from code injection audits to best practices for client data handling.\n\n## Strategic Approach\n\nWe are not just developers — we are strategic partners who take the time to truly understand your business, challenges, and goals before proposing solutions. Every recommendation in this proposal is grounded in research specific to your industry and market.\n\n## Notable Clients & Experience\n\nOur experience extends across companies of all sizes, from social media giants and trillion-dollar search engines to government agencies. Clients include Shell, Redcell Technologies, Facebook, MadcapLogic, and many more. Michael is also a Full Sail University Hall of Fame inductee with 70+ speaking engagements worldwide.`,
  },
  {
    key: "technologies",
    title: "Technologies & Approach",
    content: `## Platform\n\n{{platform_description}}\n\n## Development Tools\n\n{{development_tools}}\n\n## Analytics & Monitoring\n\n{{analytics_tools}}`,
  },
  {
    key: "budget",
    title: "Budget",
    content: null,
  },
  {
    key: "production_process",
    title: "Production Process",
    content: `## Discovery Process\n\nThe first phase of the process is all about gathering and examining the necessary information to kick off the project.\n\n- Collect the client's existing materials, brand guidelines, and content.\n- Determine the target audience.\n- Learn who the client's competitors are.\n- Determine project timeline and phase deliverables.\n\n## Design & Strategy\n\n{{design_strategy_description}}\n\n## Development & Implementation\n\n{{development_implementation_description}}\n\n## Delivery\n\nThe last phase is where we deliver all completed work and hand off documentation to the client.\n\n- All changes documented with before/after evidence where applicable.\n- Client training session on all delivered systems and tools.\n- Written documentation covering workflows, checklists, and user guides.\n- Final review meeting with client.`,
  },
  {
    key: "assumptions",
    title: "Details and Assumptions",
    content: `- All content and imagery will be provided by the client.\n- If needed, La Plante Web Development will offer additional services at an additional cost to original project budget.\n- All content is to be delivered by specific dates discussed, otherwise project launch could be delayed.\n- The estimated budget is based on existing information. Once criteria and site direction are finalized, additional costs may apply.\n- If this proposal is accepted, La Plante Web Development and the client agree to have a kickoff meeting to discuss specific client needs for the project.`,
  },
  {
    key: "terms",
    title: "Terms of Agreement",
    content: `This proposal outlines the scope of the project requested by {{client_name}} as understood by La Plante Web Development and serves as an estimate only. Actual timelines and costs are determined by the actual scope of work completed.\n\nStart of work for the project outlined in this statement of work is contingent upon signing of a contractual agreement between {{client_name}} and La Plante Web Development.\n\nLa Plante Web Development typically invoices for total costs at THREE key points of project development: Initial statement of work approval (signing of this document), mid-project milestone, and 30 days after project completion.\n\nThis proposal is subject to acceptance within 30 days.\n\nAny requirements not able to be implemented within this timeframe or any additional requirements not documented in the business requirements document as part of the initial project scope can be estimated and contracted at a later date.\n\nPayment term for all invoices is 30 days — with initial invoice due upon receipt.\n\n## Disclaimer\n\nCopyright © 2026 La Plante Web Development. Other trade names mentioned in this publication belong to their respective owners. The enclosed material is proprietary to La Plante Web Development.`,
  },
];

export async function seedProposalTemplate(
  db: PrismaClient,
  organizationId: string
) {
  const existing = await db.proposalTemplate.findFirst({
    where: {
      organizationId,
      isDefault: true,
    },
  });

  if (existing) {
    return existing;
  }

  return db.proposalTemplate.create({
    data: {
      name: "La Plante Project Proposal",
      sections: DEFAULT_SECTIONS,
      isDefault: true,
      organizationId,
    },
  });
}

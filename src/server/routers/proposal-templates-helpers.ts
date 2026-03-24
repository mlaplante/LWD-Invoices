import { z } from "zod";

export const proposalSectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  content: z.string().nullable(),
});

export const proposalSectionsSchema = z.array(proposalSectionSchema).min(1);

type ProposalSection = z.infer<typeof proposalSectionSchema>;

export function validateSections(sections: ProposalSection[]): boolean {
  const keys = sections.map((s) => s.key);
  return new Set(keys).size === keys.length;
}

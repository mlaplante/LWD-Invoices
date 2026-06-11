import { z } from "zod";
import { env } from "@/lib/env";
import { callGeminiWithModelFallback, resolveGeminiModels } from "./gemini-fallback";
import { extractGeminiText } from "./natural-language-invoice";
import { parseValidatedJson, AiOutputError } from "./ai-structured-output";

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

export interface ProposalSection {
  key: string;
  title: string;
  content: string;
}

/**
 * Keep only generated sections whose key matches the template, in template
 * order; fill any section the model omitted from the template with empty
 * content. The template — never the model — owns the section structure.
 */
export function conformSectionKeys(
  generated: ProposalSection[],
  template: ProposalSection[],
): ProposalSection[] {
  const byKey = new Map(generated.map((s) => [s.key, s]));
  return template.map((t) => {
    const g = byKey.get(t.key);
    return { key: t.key, title: t.title, content: g?.content ?? "" };
  });
}

export interface ProposalContext {
  clientName: string;
  projectName?: string | null;
  projectDescription?: string | null;
  /** Section scaffold from the selected/default template — owns the structure. */
  templateSections: ProposalSection[];
  /** Up to N past proposals' sections for style/context (org-scoped). */
  pastProposals: ProposalSection[][];
  /** The org's real pricing items the model may suggest from. */
  items: OrgItem[];
}

export interface GeneratedProposal {
  sections: ProposalSection[];
  suggestedItems: GroundedLineItem[];
}

const GENERATION_SCHEMA = z.object({
  sections: z.array(z.object({ key: z.string(), title: z.string(), content: z.string() })),
  suggestedItems: z.array(z.object({ itemId: z.string(), quantity: z.number(), rate: z.number() })),
});

const GEMINI_PROPOSAL_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

const SYSTEM_PROMPT =
  "You draft a client proposal. Fill the provided template sections (scope, timeline, milestones, payment schedule) " +
  "using the client/project context and the style of past proposals. Suggest line items ONLY from the provided item list " +
  "(by itemId). Return ONLY JSON: {\"sections\":[{\"key\":string,\"title\":string,\"content\":string}]," +
  "\"suggestedItems\":[{\"itemId\":string,\"quantity\":number,\"rate\":number}]}. " +
  "Use only section keys and itemIds provided. Never invent items or prices.";

/**
 * Generate a proposal draft. Returns null when AI is unconfigured or output is
 * invalid (caller falls back to the plain template path). Section structure is
 * conformed to the template and suggested items are grounded to real items.
 */
export async function generateProposal(ctx: ProposalContext): Promise<GeneratedProposal | null> {
  if (!env.GEMINI_API_KEY) return null;
  // User-authored fields are serialized via JSON.stringify (so they can't break
  // out of the prompt structure) and length-capped here so a hostile client or
  // project record can't smuggle a page of adversarial instructions — or blow
  // up token spend — through the context.
  const userPayload = JSON.stringify({
    client: truncate(ctx.clientName, 200),
    project: {
      name: ctx.projectName ? truncate(ctx.projectName, 200) : null,
      description: ctx.projectDescription ? truncate(ctx.projectDescription, 2000) : null,
    },
    templateSections: ctx.templateSections,
    pastProposals: ctx.pastProposals,
    items: ctx.items.map((i) => ({ id: i.id, name: i.name, rate: i.rate })),
  });
  try {
    const raw = await callGeminiWithModelFallback({
      apiKey: env.GEMINI_API_KEY,
      models: resolveGeminiModels(env.GEMINI_PROPOSAL_MODELS, GEMINI_PROPOSAL_MODELS),
      body: {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPayload }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
      },
      label: "proposal generation",
      onOk: (json) => parseValidatedJson(extractGeminiText(json), GENERATION_SCHEMA),
    });
    return {
      sections: conformSectionKeys(raw.sections, ctx.templateSections),
      suggestedItems: groundSuggestedItems(raw.suggestedItems, ctx.items),
    };
  } catch (err) {
    if (err instanceof AiOutputError) return null;
    return null;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
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

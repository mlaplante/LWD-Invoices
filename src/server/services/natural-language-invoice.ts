import { InvoiceStatus, LineType } from "@/generated/prisma";
import { env } from "@/lib/env";
import { callGeminiWithModelFallback, resolveGeminiModels } from "./gemini-fallback";

export type NaturalLanguageInvoiceContext = {
  defaultCurrencyId: string;
  clients: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string; description?: string | null; rate?: number | null; unit?: string | null }>;
  taxes: Array<{ id: string; name: string; rate?: number | null }>;
};

export type NaturalLanguageInvoiceExtractedLine = {
  name: string;
  description?: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  lineType?: "standard" | "expense" | "flat_rate";
  confidence?: number;
};

export type NaturalLanguageInvoiceExtraction = {
  clientName?: string;
  lines: NaturalLanguageInvoiceExtractedLine[];
  notes?: string;
  dueDate?: string;
  taxNames?: string[];
  ambiguities?: string[];
  confidence?: number;
};

type NaturalLanguageInvoiceDraftLine = {
  sort: number;
  lineType: LineType;
  name: string;
  description?: string;
  qty: number;
  rate: number;
  period?: number;
  discount: number;
  discountIsPercentage: boolean;
  taxIds: string[];
  sourceTable?: string;
  sourceId?: string;
  matchConfidence?: number;
  warnings: string[];
};

export type NaturalLanguageInvoiceAmbiguity = {
  field: string;
  message: string;
  options?: Array<{ id: string; name: string }>;
};

export type NaturalLanguageInvoiceDraft = {
  status: InvoiceStatus;
  requiresReview: true;
  prompt: string;
  currencyId: string;
  clientId?: string;
  clientName?: string;
  dueDate?: string;
  notes?: string;
  lines: NaturalLanguageInvoiceDraftLine[];
  ambiguities: NaturalLanguageInvoiceAmbiguity[];
};

export type BuildNaturalLanguageInvoiceDraftInput = {
  prompt: string;
  extraction: NaturalLanguageInvoiceExtraction;
  context: NaturalLanguageInvoiceContext;
};

const MIN_CONFIDENT_MATCH = 0.58;
const AMBIGUOUS_DELTA = 0.12;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ux|ui|the|a|an|monthly|hour|hours|hr|hrs|license|licence)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function scoreTextMatch(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.86;

  const qTokens = tokenSet(q);
  const cTokens = tokenSet(c);
  const intersection = [...qTokens].filter((token) => cTokens.has(token)).length;
  const union = new Set([...qTokens, ...cTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function rankedMatches<T extends { name: string }>(query: string | undefined, candidates: T[]) {
  if (!query) return [];
  return candidates
    .map((candidate) => ({ candidate, score: scoreTextMatch(query, candidate.name) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));
}

function resolveClient(
  extraction: NaturalLanguageInvoiceExtraction,
  context: NaturalLanguageInvoiceContext,
): { clientId?: string; clientName?: string; ambiguities: NaturalLanguageInvoiceAmbiguity[] } {
  const matches = rankedMatches(extraction.clientName, context.clients);
  if (matches.length === 0) {
    return {
      clientName: extraction.clientName,
      ambiguities: extraction.clientName
        ? [{ field: "client", message: `No client matched '${extraction.clientName}'.` }]
        : [{ field: "client", message: "No client was identified from the prompt." }],
    };
  }

  const [best, second] = matches;
  const likelyAmbiguous =
    (extraction.confidence ?? 1) < 0.7 && matches.length > 1
    || (!!second && best.score < 1 && best.score - second.score <= AMBIGUOUS_DELTA);

  if (likelyAmbiguous) {
    return {
      clientName: extraction.clientName,
      ambiguities: [
        {
          field: "client",
          message: `Multiple clients may match '${extraction.clientName}'. Confirm the client before saving.`,
          options: matches.slice(0, 5).map((m) => ({ id: m.candidate.id, name: m.candidate.name })),
        },
      ],
    };
  }

  return { clientId: best.candidate.id, clientName: best.candidate.name, ambiguities: [] };
}

function toLineType(line: NaturalLanguageInvoiceExtractedLine): LineType {
  if (line.lineType === "expense") return LineType.EXPENSE;
  if (line.lineType === "flat_rate") return LineType.FLAT_RATE;
  return LineType.STANDARD;
}

function taxIdsForExtraction(extraction: NaturalLanguageInvoiceExtraction, context: NaturalLanguageInvoiceContext): string[] {
  const requested = extraction.taxNames ?? [];
  if (requested.length === 0) return [];
  return requested.flatMap((taxName) => {
    const match = rankedMatches(taxName, context.taxes)[0];
    return match && match.score >= MIN_CONFIDENT_MATCH ? [match.candidate.id] : [];
  });
}

function buildLine(
  line: NaturalLanguageInvoiceExtractedLine,
  sort: number,
  context: NaturalLanguageInvoiceContext,
  taxIds: string[],
): { line: NaturalLanguageInvoiceDraftLine; ambiguities: NaturalLanguageInvoiceAmbiguity[] } {
  const matches = rankedMatches(line.name, context.items);
  const [best, second] = matches;
  const warnings: string[] = [];
  const ambiguities: NaturalLanguageInvoiceAmbiguity[] = [];

  let matchedItem: NaturalLanguageInvoiceContext["items"][number] | undefined;
  let matchConfidence = 0;

  if (best && best.score >= MIN_CONFIDENT_MATCH) {
    if (second && second.score >= MIN_CONFIDENT_MATCH && best.score - second.score <= AMBIGUOUS_DELTA) {
      ambiguities.push({
        field: `line[${sort}].item`,
        message: `Multiple items may match '${line.name}'. Confirm the item or keep this as a freeform line.`,
        options: matches.slice(0, 5).map((m) => ({ id: m.candidate.id, name: m.candidate.name })),
      });
    } else {
      matchedItem = best.candidate;
      matchConfidence = best.score;
      if (line.name.trim().toLowerCase() !== matchedItem.name.trim().toLowerCase()) {
        warnings.push(`Matched '${line.name}' to item '${matchedItem.name}'.`);
      }
    }
  }

  if ((line.confidence ?? 1) < 0.65) {
    ambiguities.push({
      field: `line[${sort}]`,
      message: `Low confidence parsing '${line.name}'. Confirm quantity, rate, and item before saving.`,
    });
  }

  const qty = line.quantity ?? 1;
  const rate = line.rate ?? matchedItem?.rate ?? 0;

  return {
    line: {
      sort,
      lineType: toLineType(line),
      name: matchedItem?.name ?? line.name,
      description: line.description ?? matchedItem?.description ?? undefined,
      qty,
      rate: Number(rate),
      discount: 0,
      discountIsPercentage: false,
      taxIds,
      sourceTable: matchedItem ? "items" : undefined,
      sourceId: matchedItem?.id,
      matchConfidence: matchedItem ? matchConfidence : undefined,
      warnings,
    },
    ambiguities,
  };
}

export function buildNaturalLanguageInvoiceDraft({
  prompt,
  extraction,
  context,
}: BuildNaturalLanguageInvoiceDraftInput): NaturalLanguageInvoiceDraft {
  const resolvedClient = resolveClient(extraction, context);
  const taxIds = taxIdsForExtraction(extraction, context);
  const lineResults = extraction.lines.map((line, index) => buildLine(line, index, context, taxIds));

  const extractionAmbiguities = (extraction.ambiguities ?? []).map((message) => ({
    field: "prompt",
    message,
  }));

  return {
    status: InvoiceStatus.DRAFT,
    requiresReview: true,
    prompt,
    currencyId: context.defaultCurrencyId,
    clientId: resolvedClient.clientId,
    clientName: resolvedClient.clientName,
    dueDate: extraction.dueDate,
    notes: extraction.notes,
    lines: lineResults.map((result) => result.line),
    ambiguities: [
      ...resolvedClient.ambiguities,
      ...lineResults.flatMap((result) => result.ambiguities),
      ...extractionAmbiguities,
    ],
  };
}

// ─── Provider-agnostic prompt extraction ────────────────────────────────────

export type InvoiceParserProvider = "openai" | "gemini";

export type ExtractNaturalLanguageInvoiceOptions = {
  provider?: InvoiceParserProvider;
};

const SYSTEM_PROMPT =
  "Extract draft invoice data from the user's natural-language prompt. Return only JSON with keys: clientName, lines [{name, description, quantity, unit, rate, lineType, confidence}], notes, dueDate (YYYY-MM-DD), taxNames, ambiguities, confidence. lineType is one of standard, expense, flat_rate. Use null for anything you cannot determine. Do not invent customers, and never send or save invoices.";

const OPENAI_DEFAULT_MODEL = "gpt-4.1-mini";
// Ordered Gemini fallback chain — on a 429 (rate-limit/quota) the next model is
// tried, which rescues the case where Google has zeroed the free-tier quota on
// one model but not others. Mirrors GEMINI_DEFAULT_MODELS in receipt-ocr.ts;
// override the whole chain via GEMINI_INVOICE_PARSER_MODELS.
const GEMINI_DEFAULT_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

// Strict JSON schema shared with the OpenAI Responses API. Gemini relies on
// responseMimeType + the system prompt instead (its strict-schema support is
// shape-incompatible with OpenAI's), but both funnel through normalizeExtraction.
const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    clientName: { type: ["string", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          rate: { type: ["number", "null"] },
          lineType: { type: ["string", "null"], enum: ["standard", "expense", "flat_rate", null] },
          confidence: { type: ["number", "null"] },
        },
        required: ["name", "description", "quantity", "unit", "rate", "lineType", "confidence"],
      },
    },
    notes: { type: ["string", "null"] },
    dueDate: { type: ["string", "null"] },
    taxNames: { type: "array", items: { type: "string" } },
    ambiguities: { type: "array", items: { type: "string" } },
    confidence: { type: ["number", "null"] },
  },
  required: ["clientName", "lines", "notes", "dueDate", "taxNames", "ambiguities", "confidence"],
} as const;

/**
 * Pick the parser provider: explicit override → INVOICE_PARSER_PROVIDER →
 * whichever API key is configured (preferring OpenAI). Mirrors the
 * resolveProvider precedence in receipt-ocr.ts.
 */
export function resolveInvoiceParserProvider(override?: InvoiceParserProvider): InvoiceParserProvider {
  if (override) return override;
  if (env.INVOICE_PARSER_PROVIDER === "openai" || env.INVOICE_PARSER_PROVIDER === "gemini") {
    return env.INVOICE_PARSER_PROVIDER;
  }
  if (env.OPENAI_API_KEY) return "openai";
  if (env.GEMINI_API_KEY) return "gemini";
  return "openai";
}

/**
 * Provider-agnostic entry point. Routes the prompt to OpenAI or Gemini and
 * returns a normalized extraction. This is what the router should call.
 */
export async function extractNaturalLanguageInvoice(
  prompt: string,
  options: ExtractNaturalLanguageInvoiceOptions = {},
): Promise<NaturalLanguageInvoiceExtraction> {
  const provider = resolveInvoiceParserProvider(options.provider);
  return provider === "gemini"
    ? extractNaturalLanguageInvoiceWithGemini(prompt)
    : extractNaturalLanguageInvoiceWithOpenAI(prompt);
}

export async function extractNaturalLanguageInvoiceWithOpenAI(prompt: string): Promise<NaturalLanguageInvoiceExtraction> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_INVOICE_PARSER_MODEL ?? OPENAI_DEFAULT_MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "invoice_extraction",
          strict: true,
          schema: EXTRACTION_JSON_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI invoice parsing failed (${response.status})`);
  }

  const payload = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const raw = payload.output_text
    ?? payload.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  if (!raw) throw new Error("OpenAI invoice parsing returned no JSON output");

  return normalizeExtraction(raw);
}

export async function extractNaturalLanguageInvoiceWithGemini(prompt: string): Promise<NaturalLanguageInvoiceExtraction> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // The model-chain loop + 429 retry/fallthrough lives in the shared
  // gemini-fallback runner (also used by receipt-ocr and reminder drafting).
  // We keep the local extractGeminiText below (its ""-join reconstructs JSON
  // split across parts; the shared one joins with "\n", which would corrupt a
  // string token straddling two parts).
  return callGeminiWithModelFallback({
    apiKey,
    models: resolveGeminiModels(env.GEMINI_INVOICE_PARSER_MODELS, GEMINI_DEFAULT_MODELS),
    body: {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // responseMimeType forces pure-JSON output (no markdown fences); temp 0
      // keeps extraction deterministic.
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    },
    label: "invoice parsing",
    onOk: (json) => {
      const raw = extractGeminiText(json);
      if (!raw) throw new Error("Gemini invoice parsing returned no JSON output");
      return normalizeExtraction(raw);
    },
  });
}

/** Pull the concatenated text parts out of a Gemini generateContent response. */
export function extractGeminiText(response: Record<string, unknown>): string {
  const candidates = response.candidates;
  if (!Array.isArray(candidates)) return "";
  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== "object") return [];
      const parts = (content as { parts?: unknown }).parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

/**
 * Parse a raw JSON string from any provider into a normalized extraction,
 * coercing the schema's nullable fields to `undefined` so downstream matching
 * doesn't have to special-case null.
 */
export function normalizeExtraction(raw: string): NaturalLanguageInvoiceExtraction {
  const parsed = JSON.parse(raw) as NaturalLanguageInvoiceExtraction;
  return {
    ...parsed,
    clientName: parsed.clientName ?? undefined,
    notes: parsed.notes ?? undefined,
    dueDate: parsed.dueDate ?? undefined,
    taxNames: parsed.taxNames ?? [],
    ambiguities: parsed.ambiguities ?? [],
    lines: (parsed.lines ?? []).map((line) => ({
      ...line,
      description: line.description ?? undefined,
      quantity: line.quantity ?? undefined,
      unit: line.unit ?? undefined,
      rate: line.rate ?? undefined,
      lineType: line.lineType ?? undefined,
      confidence: line.confidence ?? undefined,
    })),
  };
}

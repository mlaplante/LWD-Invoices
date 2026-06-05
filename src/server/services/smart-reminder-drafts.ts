import { env } from "@/lib/env";
import { interpolateTemplate } from "./automation-template";

export type ReminderTone = "helpful" | "professional" | "firm";
export type ReminderDraftSource = "ai" | "template_fallback";
export type ReminderAIProvider = "openai" | "gemini";
export type ReminderDraftFallbackReason =
  | "missing_ai_config"
  | "insufficient_payment_history"
  | "ai_call_failed"
  | "invalid_ai_response"
  | "ai_fact_mismatch";

export interface ReminderInvoiceFacts {
  invoiceNumber: string;
  amountDue: string;
  currencyCode: string;
  dueDate: string;
  daysOverdue: number;
  paymentUrl?: string;
}

export interface ReminderTemplateInput {
  subject: string;
  body: string;
}

export interface ReminderPaymentProfile {
  paidInvoiceCount: number;
  onTimePercent: number | null;
  lateInvoiceCount: number;
}

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
}

// Back-compat alias: callers and tests used `OpenAIConfig` before Gemini support.
export type OpenAIConfig = AIProviderConfig;

export interface AIReminderResponse {
  subject: string;
  body: string;
}

export type AIReminderCall = (
  prompt: string,
  config: Required<AIProviderConfig>,
) => Promise<AIReminderResponse>;

export interface GenerateReminderDraftInput {
  invoice: ReminderInvoiceFacts;
  template: ReminderTemplateInput;
  organization: { name: string };
  paymentProfile: ReminderPaymentProfile;
  reliablePayerThreshold?: number;
  // Explicit provider override. When unset, falls back to REMINDER_AI_PROVIDER,
  // then to whichever provider has an API key configured (openai preferred).
  provider?: ReminderAIProvider;
  openAI?: AIProviderConfig;
  gemini?: AIProviderConfig;
  // Test seams: override the network call for the resolved provider.
  callOpenAI?: AIReminderCall;
  callGemini?: AIReminderCall;
}

export interface ReminderDraft {
  subject: string;
  body: string;
  tone: ReminderTone;
  source: ReminderDraftSource;
  reviewRequired: true;
  fallbackReason?: ReminderDraftFallbackReason;
}

const MIN_HISTORY_FOR_AI_TONE = 3;
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_RELIABLE_PAYER_THRESHOLD = 90;
const REMINDER_SYSTEM_PROMPT =
  "You draft safe, concise invoice reminder emails and return strict JSON only.";

export function selectReminderTone(
  profile: ReminderPaymentProfile,
  reliablePayerThreshold = DEFAULT_RELIABLE_PAYER_THRESHOLD,
  daysOverdue = 0,
): ReminderTone {
  if (
    profile.paidInvoiceCount >= MIN_HISTORY_FOR_AI_TONE &&
    profile.onTimePercent !== null &&
    profile.onTimePercent >= reliablePayerThreshold &&
    daysOverdue <= 7
  ) {
    return "helpful";
  }

  if (
    daysOverdue >= 14 ||
    profile.lateInvoiceCount >= 3 ||
    (profile.onTimePercent !== null && profile.paidInvoiceCount >= MIN_HISTORY_FOR_AI_TONE && profile.onTimePercent <= 50)
  ) {
    return "firm";
  }

  return "professional";
}

export function buildOpenAIReminderPrompt(input: {
  invoice: ReminderInvoiceFacts;
  template: ReminderTemplateInput;
  organization: { name: string };
  paymentProfile: ReminderPaymentProfile;
  tone: ReminderTone;
}): string {
  const overdueContext = input.invoice.daysOverdue > 0
    ? `${input.invoice.daysOverdue} days overdue`
    : input.invoice.daysOverdue === 0
      ? "due today or upcoming according to the reminder sequence"
      : `${Math.abs(input.invoice.daysOverdue)} days before due date`;

  return [
    "Draft a concise professional payment reminder email.",
    "Return only JSON with string fields: subject, body.",
    `Tone: ${input.tone}.`,
    `Organization name: ${input.organization.name}.`,
    "Use only these deterministic invoice facts:",
    `- Invoice number: ${input.invoice.invoiceNumber}`,
    `- Amount due: ${input.invoice.amountDue} ${input.invoice.currencyCode}`,
    `- Due date: ${input.invoice.dueDate}`,
    `- Status timing: ${overdueContext}`,
    input.invoice.paymentUrl ? `- Payment URL: ${input.invoice.paymentUrl}` : "- Payment URL: not provided",
    "Payment behavior summary (aggregate only; no client identity):",
    `- Paid invoice count: ${input.paymentProfile.paidInvoiceCount}`,
    `- On-time percent: ${input.paymentProfile.onTimePercent ?? "unknown"}`,
    `- Late invoice count: ${input.paymentProfile.lateInvoiceCount}`,
    "Compliance and safety rules:",
    "- Do not add, infer, or change invoice facts.",
    "- Do not mention legal action, credit reporting, collections, penalties, or fees unless present in the template.",
    "- Do not include client email, legal name, address, tax details, or line items.",
    "- Keep it human-reviewable and editable before sending.",
    "Existing fallback template, already containing the intended facts/placeholders:",
    `Subject template: ${input.template.subject}`,
    `Body template: ${input.template.body}`,
  ].join("\n");
}

function templateDraft(input: GenerateReminderDraftInput, tone: ReminderTone, fallbackReason: ReminderDraftFallbackReason): ReminderDraft {
  const vars = {
    invoiceNumber: input.invoice.invoiceNumber,
    amountDue: `${input.invoice.amountDue} ${input.invoice.currencyCode}`,
    dueDate: input.invoice.dueDate,
    paymentLink: input.invoice.paymentUrl ?? "",
    paymentUrl: input.invoice.paymentUrl ?? "",
    orgName: input.organization.name,
  };

  return {
    subject: interpolateTemplate(input.template.subject, vars),
    body: interpolateTemplate(input.template.body, vars),
    tone,
    source: "template_fallback",
    reviewRequired: true,
    fallbackReason,
  };
}

function normalizeAmount(value: string): string {
  return value.replace(/[^0-9.]/g, "").replace(/\.00$/, "");
}

// URLs may be trailed by sentence punctuation in prose (e.g. "pay at <url>.").
function stripTrailingPunctuation(token: string): string {
  return token.replace(/[.,;:!?)\]}>"']+$/, "");
}

function containsHallucinatedInvoiceFacts(text: string, invoice: ReminderInvoiceFacts): boolean {
  const allowedInvoice = invoice.invoiceNumber.toLowerCase();
  const invoiceLikeTokens = text.match(/\b[A-Z]{2,}-?\d{2,}\b/g) ?? [];
  if (invoiceLikeTokens.some((token) => token.toLowerCase() !== allowedInvoice)) return true;

  // Amounts in a reminder are always 2-decimal currency values (the call site
  // formats with .toFixed(2)), so any decimal token that isn't the invoice
  // amount is a hallucinated figure. We do NOT exempt `daysOverdue`: the overdue
  // count is rendered as a bare integer ("21 days overdue") that never matches
  // this 2-decimal pattern, so the previous carve-out only opened a bypass for a
  // wrong amount that happened to equal the overdue count. Known limitation: a
  // locale-formatted year ("2,026.00") would also match here and trip a fallback
  // — acceptable, since a failed guard only downgrades to the safe template.
  const expectedAmount = normalizeAmount(invoice.amountDue);
  const amountTokens = text.match(/(?:[$€£]\s*)?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/g) ?? [];
  for (const token of amountTokens) {
    const normalized = normalizeAmount(token);
    if (normalized && normalized !== expectedAmount) {
      return true;
    }
  }

  // The due date is fed to the model in ISO form (YYYY-MM-DD), so any ISO date
  // token that differs from the invoice due date is a hallucinated fact. Guard
  // only when the expected value is itself ISO to avoid false positives on
  // non-ISO inputs (mirrors the amount guard's format-specificity).
  const expectedDueDate = invoice.dueDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(expectedDueDate)) {
    const isoDateTokens = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
    if (isoDateTokens.some((token) => token !== expectedDueDate)) return true;
  }

  // Payment URLs are security-sensitive: a swapped host or token could redirect
  // payment. Every URL in the draft must exactly match the deterministic payment
  // URL; if none was provided, the draft must not invent one. A failed guard
  // falls back to the safe template, so we err strict. The comparison is
  // intentionally case-sensitive: the URL is built from NEXT_PUBLIC_APP_URL plus
  // an opaque DB portal token, so any case or character difference is a genuine
  // mismatch worth rejecting rather than normalizing away.
  const allowedPaymentUrl = invoice.paymentUrl?.trim();
  const urlTokens = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  for (const token of urlTokens) {
    if (!allowedPaymentUrl || stripTrailingPunctuation(token) !== allowedPaymentUrl) return true;
  }

  return false;
}

function parseAIResponse(value: AIReminderResponse): AIReminderResponse | null {
  if (!value || typeof value.subject !== "string" || typeof value.body !== "string") return null;
  const subject = value.subject.trim();
  const body = value.body.trim();
  if (!subject || !body || subject.length > 200 || body.length > 5000) return null;
  return { subject, body };
}

async function callOpenAIChatCompletionsAPI(prompt: string, config: Required<AIProviderConfig>): Promise<AIReminderResponse> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: REMINDER_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI reminder draft request failed: ${response.status}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI reminder draft response was empty");
  return JSON.parse(content) as AIReminderResponse;
}

// Mirrors the Gemini call shape used by receipt-ocr: x-goog-api-key header,
// systemInstruction + contents parts, and responseMimeType to force pure JSON.
async function callGeminiGenerateContentAPI(prompt: string, config: Required<AIProviderConfig>): Promise<AIReminderResponse> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: REMINDER_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini reminder draft request failed: ${response.status}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const content = extractGeminiText(data);
  if (!content) throw new Error("Gemini reminder draft response was empty");
  return JSON.parse(content) as AIReminderResponse;
}

// Defensive extraction mirroring receipt-ocr's helper: Gemini may return
// multiple candidates/parts, so join all text rather than reading parts[0].
function extractGeminiText(response: Record<string, unknown>): string {
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
    .join("\n");
}

// Resolve the provider: explicit input wins, then REMINDER_AI_PROVIDER, then
// whichever provider has an API key (openai preferred). Mirrors receipt-ocr's
// resolveProvider so config behaves consistently across AI features.
function resolveReminderProvider(input: GenerateReminderDraftInput): ReminderAIProvider {
  const explicit = input.provider ?? env.REMINDER_AI_PROVIDER;
  if (explicit === "openai" || explicit === "gemini") return explicit;
  if (input.gemini?.apiKey ?? env.GEMINI_API_KEY) {
    if (!(input.openAI?.apiKey ?? env.OPENAI_API_KEY)) return "gemini";
  }
  return "openai";
}

function resolveProviderConfig(
  input: GenerateReminderDraftInput,
  provider: ReminderAIProvider,
): { apiKey: string | undefined; model: string } {
  if (provider === "gemini") {
    return {
      apiKey: input.gemini?.apiKey ?? env.GEMINI_API_KEY,
      model: input.gemini?.model ?? env.GEMINI_REMINDER_MODEL ?? DEFAULT_GEMINI_MODEL,
    };
  }
  return {
    apiKey: input.openAI?.apiKey ?? env.OPENAI_API_KEY,
    model: input.openAI?.model ?? env.OPENAI_REMINDER_MODEL ?? DEFAULT_OPENAI_MODEL,
  };
}

export async function generateSmartReminderDraft(input: GenerateReminderDraftInput): Promise<ReminderDraft> {
  const tone = selectReminderTone(
    input.paymentProfile,
    input.reliablePayerThreshold ?? DEFAULT_RELIABLE_PAYER_THRESHOLD,
    input.invoice.daysOverdue,
  );

  if (
    input.paymentProfile.paidInvoiceCount < MIN_HISTORY_FOR_AI_TONE ||
    input.paymentProfile.onTimePercent === null
  ) {
    return templateDraft(input, tone, "insufficient_payment_history");
  }

  const provider = resolveReminderProvider(input);
  const config = resolveProviderConfig(input, provider);

  if (!config.apiKey) {
    return templateDraft(input, tone, "missing_ai_config");
  }

  const prompt = buildOpenAIReminderPrompt({
    invoice: input.invoice,
    template: input.template,
    organization: input.organization,
    paymentProfile: input.paymentProfile,
    tone,
  });

  const callModel = provider === "gemini"
    ? (input.callGemini ?? callGeminiGenerateContentAPI)
    : (input.callOpenAI ?? callOpenAIChatCompletionsAPI);

  let aiResponse: AIReminderResponse;
  try {
    aiResponse = await callModel(prompt, config as Required<AIProviderConfig>);
  } catch {
    return templateDraft(input, tone, "ai_call_failed");
  }

  const parsed = parseAIResponse(aiResponse);
  if (!parsed) return templateDraft(input, tone, "invalid_ai_response");

  if (containsHallucinatedInvoiceFacts(`${parsed.subject}\n${parsed.body}`, input.invoice)) {
    return templateDraft(input, tone, "ai_fact_mismatch");
  }

  return {
    subject: parsed.subject,
    body: parsed.body,
    tone,
    source: "ai",
    reviewRequired: true,
  };
}

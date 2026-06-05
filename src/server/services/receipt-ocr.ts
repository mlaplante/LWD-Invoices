import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

export interface OCRLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface OCRResult {
  vendor: string | null;
  amount: number | null;
  tax: number | null;
  currency: string | null;
  date: string | null;
  category: string | null;
  confidence: number;
  lineItems: OCRLineItem[];
  rawResponse: Record<string, unknown>;
}

export type ReceiptOCRProvider = "openai" | "anthropic" | "gemini";

export type ReceiptOCROptions = {
  provider?: ReceiptOCRProvider;
  fileName?: string;
};

const SYSTEM_PROMPT = `You are a receipt OCR and expense extraction engine. Given a receipt image or PDF, extract structured data.

Return ONLY valid JSON matching this schema:
{
  "vendor": "string or null - the merchant/vendor name",
  "amount": "number or null - final total amount paid/owed",
  "tax": "number or null - tax amount if shown separately",
  "currency": "string or null - 3-letter currency code like USD, CAD, EUR",
  "date": "string or null - receipt date in YYYY-MM-DD format",
  "category": "string or null - expense category hint like Software, Office Supplies, Travel, Meals, Equipment, Services, Utilities",
  "confidence": "number 0-1 - confidence in extraction accuracy",
  "lineItems": [
    {
      "description": "string",
      "quantity": "number",
      "unitPrice": "number",
      "total": "number"
    }
  ]
}

Rules:
- If a field cannot be determined, use null
- Amounts should be numbers without currency symbols
- Dates must be YYYY-MM-DD format
- Confidence: 1.0 = very clear receipt, 0.5 = partially readable, 0.0 = unreadable
- Extract all line items you can identify
- Do not include any text outside the JSON object`;

const OPENAI_MODEL = "gpt-4.1-mini";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
// Ordered fallback chain of vision-capable Gemini models. All handle both
// images and PDFs via inlineData. When a model returns a 429 (rate-limit or
// quota), the next model is tried — this rescues the case where Google has
// zeroed the free-tier quota on one specific model but not others. Override
// the whole chain via the GEMINI_OCR_MODELS env var.
const GEMINI_DEFAULT_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
// This OCR runs inside a request the user is actively waiting on, so we never
// sleep long: a 429 on any model that still has a fallback falls straight
// through to the next model. Only the final model in the chain retries with a
// short, capped backoff before giving up.
const GEMINI_MAX_RETRY_DELAY_MS = 2000;
const GEMINI_LAST_MODEL_RETRIES = 2;

export async function parseReceiptWithOCR(
  fileData: Buffer,
  mimeType: string,
  options: ReceiptOCROptions = {},
): Promise<OCRResult> {
  const provider = resolveProvider(options.provider);
  if (provider === "openai") {
    return parseReceiptWithOpenAI(fileData, mimeType, options.fileName);
  }
  if (provider === "gemini") {
    return parseReceiptWithGemini(fileData, mimeType);
  }
  return parseReceiptWithAnthropic(fileData, mimeType);
}

function resolveProvider(override?: ReceiptOCRProvider): ReceiptOCRProvider {
  if (override) return override;
  const configured = env.RECEIPT_OCR_PROVIDER;
  if (configured === "openai" || configured === "anthropic" || configured === "gemini") {
    return configured;
  }
  // Fall back to whichever key is present, preferring PDF-capable providers.
  if (env.OPENAI_API_KEY) return "openai";
  if (env.GEMINI_API_KEY) return "gemini";
  return "anthropic";
}

async function parseReceiptWithOpenAI(fileData: Buffer, mimeType: string, fileName?: string): Promise<OCRResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const base64 = fileData.toString("base64");
  const userContent = mimeType === "application/pdf"
    ? [
        { type: "input_text", text: "Extract all expense data from this receipt PDF." },
        {
          type: "input_file",
          filename: fileName ?? "receipt.pdf",
          file_data: `data:${mimeType};base64,${base64}`,
        },
      ]
    : [
        { type: "input_text", text: "Extract all expense data from this receipt image." },
        { type: "input_image", image_url: `data:${mimeType};base64,${base64}` },
      ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      // Cap output so a long, many-line receipt can't truncate the JSON
      // mid-object (which would silently parse to mostly-null fields).
      // The Responses API uses max_output_tokens, not max_tokens.
      max_output_tokens: 2048,
      input: [
        { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI receipt OCR failed (${response.status}): ${body || response.statusText}`);
  }

  const json = await response.json() as Record<string, unknown>;
  return normalizeOCRPayload(extractOpenAIText(json));
}

async function parseReceiptWithAnthropic(fileData: Buffer, mimeType: string): Promise<OCRResult> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  if (mimeType === "application/pdf") {
    throw new Error("PDF receipt scanning requires OPENAI_API_KEY/RECEIPT_OCR_PROVIDER=openai");
  }

  const client = new Anthropic({ apiKey });
  const base64 = fileData.toString("base64");
  const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: "text",
            text: "Extract all data from this receipt.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";
  return normalizeOCRPayload(rawText);
}

async function parseReceiptWithGemini(fileData: Buffer, mimeType: string): Promise<OCRResult> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Gemini handles both images and PDFs via inline_data, so no PDF guard.
  const base64 = fileData.toString("base64");
  const models = resolveGeminiModels();

  let lastRateLimit: Error | null = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isLastModel = i === models.length - 1;
    // Only the final model retries with backoff; earlier models fall straight
    // through to the next model on a 429 (faster than sleeping in-request).
    const maxAttempts = isLastModel ? GEMINI_LAST_MODEL_RETRIES + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(geminiGenerateContentUrl(model), {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: "Extract all expense data from this receipt." },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],
          // responseMimeType forces pure-JSON output (no markdown fences), and
          // maxOutputTokens guards against a long receipt truncating the JSON.
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
      });

      if (response.ok) {
        const json = await response.json() as Record<string, unknown>;
        return normalizeOCRPayload(extractGeminiText(json));
      }

      const body = await response.text().catch(() => "");

      // Only 429 (rate-limit/quota) is worth trying another model for. Auth,
      // bad-request, and 404 (e.g. a misspelled model id) errors won't be
      // fixed by a different model, so fail loudly and immediately.
      if (response.status !== 429) {
        throw new Error(
          `Gemini receipt OCR failed on ${model} (${response.status}): ${body || response.statusText}`,
        );
      }

      lastRateLimit = new Error(
        `Gemini receipt OCR rate-limited on ${model} (429): ${body || response.statusText}`,
      );

      // A daily / "limit: 0" quota can't be cleared by waiting, so never sleep
      // on it — fall straight through to the next model.
      const exhausted = isGeminiQuotaExhausted(body);
      const retryDelayMs = parseGeminiRetryDelayMs(body);
      const canRetrySameModel =
        isLastModel && !exhausted && attempt < maxAttempts && retryDelayMs !== null;

      if (canRetrySameModel) {
        await sleep(Math.min(retryDelayMs, GEMINI_MAX_RETRY_DELAY_MS));
        continue;
      }

      break; // try the next model, or exit the loop if this was the last one
    }
  }

  throw lastRateLimit ?? new Error("Gemini receipt OCR failed: no models configured");
}

function resolveGeminiModels(): string[] {
  const raw = env.GEMINI_OCR_MODELS;
  if (raw) {
    const list = raw.split(",").map((m) => m.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return GEMINI_DEFAULT_MODELS;
}

function geminiGenerateContentUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// A daily request quota or a hard "limit: 0" free-tier disablement won't be
// cleared by the RetryInfo delay, so treat those as non-retryable on the same
// model and move on to the next one immediately.
function isGeminiQuotaExhausted(body: string): boolean {
  return /limit:\s*0\b/.test(body) || /PerDay/i.test(body);
}

// Gemini 429s carry a google.rpc.RetryInfo detail with retryDelay like "8s" or
// "8.152848623s". Returns the delay in ms, or null if none is present.
function parseGeminiRetryDelayMs(body: string): number | null {
  try {
    const json = JSON.parse(body) as {
      error?: { details?: Array<Record<string, unknown>> };
    };
    const details = json.error?.details;
    if (Array.isArray(details)) {
      for (const detail of details) {
        const type = detail["@type"];
        const retryDelay = detail.retryDelay;
        if (typeof type === "string" && type.includes("RetryInfo") && typeof retryDelay === "string") {
          const match = retryDelay.match(/([\d.]+)s/);
          if (match) return Math.ceil(parseFloat(match[1]) * 1000);
        }
      }
    }
  } catch {
    // Body wasn't JSON — fall through to the text-scan heuristics below.
  }
  const match =
    body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/) || body.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function extractOpenAIText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") return response.output_text;

  const output = response.output;
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((content) => {
      if (!content || typeof content !== "object") return "";
      const typed = content as { type?: unknown; text?: unknown };
      return (typed.type === "output_text" || typed.type === "text") && typeof typed.text === "string"
        ? typed.text
        : "";
    })
    .join("\n");
}

function normalizeOCRPayload(rawText: string): OCRResult {
  let parsed: Record<string, unknown>;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    parsed = { error: "Failed to parse OCR response", raw: rawText };
  }

  return {
    vendor: typeof parsed.vendor === "string" ? parsed.vendor : null,
    amount: numberOrNull(parsed.amount),
    tax: numberOrNull(parsed.tax),
    currency: typeof parsed.currency === "string" ? parsed.currency : null,
    date: typeof parsed.date === "string" ? parsed.date : null,
    category: typeof parsed.category === "string" ? parsed.category : null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    lineItems: Array.isArray(parsed.lineItems)
      ? parsed.lineItems.map((item) => {
          const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return {
            description: String(record.description ?? ""),
            quantity: Number(record.quantity ?? 0),
            unitPrice: Number(record.unitPrice ?? 0),
            total: Number(record.total ?? 0),
          };
        })
      : [],
    rawResponse: parsed,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

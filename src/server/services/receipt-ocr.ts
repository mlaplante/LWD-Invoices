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

export type ReceiptOCRProvider = "openai" | "anthropic";

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

export async function parseReceiptWithOCR(
  fileData: Buffer,
  mimeType: string,
  options: ReceiptOCROptions = {},
): Promise<OCRResult> {
  const provider = resolveProvider(options.provider);
  if (provider === "openai") {
    return parseReceiptWithOpenAI(fileData, mimeType, options.fileName);
  }
  return parseReceiptWithAnthropic(fileData, mimeType);
}

function resolveProvider(override?: ReceiptOCRProvider): ReceiptOCRProvider {
  if (override) return override;
  const configured = env.RECEIPT_OCR_PROVIDER;
  if (configured === "openai" || configured === "anthropic") return configured;
  if (env.OPENAI_API_KEY) return "openai";
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

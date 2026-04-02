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
  currency: string | null;
  date: string | null;
  category: string | null;
  confidence: number;
  lineItems: OCRLineItem[];
  rawResponse: Record<string, unknown>;
}

const SYSTEM_PROMPT = `You are a receipt OCR extraction engine. Given a receipt image, extract structured data.

Return ONLY valid JSON matching this schema:
{
  "vendor": "string or null - the merchant/vendor name",
  "amount": "number or null - total amount",
  "currency": "string or null - 3-letter currency code like USD, CAD, EUR",
  "date": "string or null - date in YYYY-MM-DD format",
  "category": "string or null - expense category like 'Software', 'Office Supplies', 'Travel', 'Meals', 'Equipment', 'Services', 'Utilities'",
  "confidence": "number 0-1 - your confidence in the extraction accuracy",
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

export async function parseReceiptWithOCR(
  imageData: Buffer,
  mimeType: string,
): Promise<OCRResult> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey });

  const base64 = imageData.toString("base64");
  const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
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

  let parsed: Record<string, unknown>;
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    parsed = { error: "Failed to parse OCR response", raw: rawText };
  }

  return {
    vendor: typeof parsed.vendor === "string" ? parsed.vendor : null,
    amount: typeof parsed.amount === "number" ? parsed.amount : null,
    currency: typeof parsed.currency === "string" ? parsed.currency : null,
    date: typeof parsed.date === "string" ? parsed.date : null,
    category: typeof parsed.category === "string" ? parsed.category : null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    lineItems: Array.isArray(parsed.lineItems)
      ? parsed.lineItems.map((item: Record<string, unknown>) => ({
          description: String(item.description ?? ""),
          quantity: Number(item.quantity ?? 0),
          unitPrice: Number(item.unitPrice ?? 0),
          total: Number(item.total ?? 0),
        }))
      : [],
    rawResponse: parsed,
  };
}

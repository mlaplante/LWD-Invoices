import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseReceiptWithOCR } from "@/server/services/receipt-ocr";

// Mock the env module
vi.mock("@/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "test-key" },
}));

// Mock the Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

describe("receipt OCR service", () => {
  const fakeImage = Buffer.from("fake-image-data");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a valid receipt response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            vendor: "Acme Corp",
            amount: 42.99,
            currency: "USD",
            date: "2026-03-15",
            category: "Software",
            confidence: 0.95,
            lineItems: [
              { description: "Pro Plan", quantity: 1, unitPrice: 42.99, total: 42.99 },
            ],
          }),
        },
      ],
    });

    const result = await parseReceiptWithOCR(fakeImage, "image/png");

    expect(result.vendor).toBe("Acme Corp");
    expect(result.amount).toBe(42.99);
    expect(result.currency).toBe("USD");
    expect(result.date).toBe("2026-03-15");
    expect(result.category).toBe("Software");
    expect(result.confidence).toBe(0.95);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].description).toBe("Pro Plan");
  });

  it("handles missing fields with null defaults", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            vendor: null,
            amount: null,
            confidence: 0.2,
          }),
        },
      ],
    });

    const result = await parseReceiptWithOCR(fakeImage, "image/jpeg");

    expect(result.vendor).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.date).toBeNull();
    expect(result.confidence).toBe(0.2);
    expect(result.lineItems).toEqual([]);
  });

  it("handles malformed JSON response gracefully", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Sorry, I cannot parse this image at all. Not valid JSON.",
        },
      ],
    });

    const result = await parseReceiptWithOCR(fakeImage, "image/png");

    expect(result.vendor).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.lineItems).toEqual([]);
  });

  it("calls OpenAI Responses API for receipt images when configured", async () => {
    const envMod = await import("@/lib/env");
    const original = { ...envMod.env } as Record<string, unknown>;
    (envMod.env as Record<string, unknown>).OPENAI_API_KEY = "test-openai";
    (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER = "openai";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          vendor: "OpenAI Store",
          amount: 19.99,
          tax: 1.5,
          currency: "USD",
          date: "2026-06-01",
          category: "Software",
          confidence: 0.92,
          lineItems: [],
        }),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await parseReceiptWithOCR(fakeImage, "image/png");

    expect(result.vendor).toBe("OpenAI Store");
    expect(result.tax).toBe(1.5);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-openai" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(body)).toContain("input_image");

    vi.unstubAllGlobals();
    delete (envMod.env as Record<string, unknown>).OPENAI_API_KEY;
    delete (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER;
    Object.assign(envMod.env, original);
  });

  it("sends PDF receipts to OpenAI as input_file", async () => {
    const envMod = await import("@/lib/env");
    const original = { ...envMod.env } as Record<string, unknown>;
    (envMod.env as Record<string, unknown>).OPENAI_API_KEY = "test-openai";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: JSON.stringify({ confidence: 0.8 }) }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await parseReceiptWithOCR(Buffer.from("%PDF"), "application/pdf", { provider: "openai", fileName: "receipt.pdf" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(body)).toContain("input_file");
    expect(JSON.stringify(body)).toContain("receipt.pdf");

    vi.unstubAllGlobals();
    delete (envMod.env as Record<string, unknown>).OPENAI_API_KEY;
    delete (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER;
    Object.assign(envMod.env, original);
  });

  it("calls the Gemini generateContent API for receipt images when configured", async () => {
    const envMod = await import("@/lib/env");
    const original = { ...envMod.env } as Record<string, unknown>;
    (envMod.env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
    (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER = "gemini";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    vendor: "Gemini Mart",
                    amount: 29.99,
                    tax: 2.25,
                    currency: "USD",
                    date: "2026-06-02",
                    category: "Office Supplies",
                    confidence: 0.88,
                    lineItems: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await parseReceiptWithOCR(fakeImage, "image/png");

    expect(result.vendor).toBe("Gemini Mart");
    expect(result.tax).toBe(2.25);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("generativelanguage.googleapis.com");
    expect(String(url)).toContain(":generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("test-gemini");
    expect(JSON.stringify(JSON.parse(init.body))).toContain("inlineData");

    vi.unstubAllGlobals();
    delete (envMod.env as Record<string, unknown>).GEMINI_API_KEY;
    delete (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER;
    Object.assign(envMod.env, original);
  });

  it("sends PDF receipts to Gemini as inline data", async () => {
    const envMod = await import("@/lib/env");
    const original = { ...envMod.env } as Record<string, unknown>;
    (envMod.env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ confidence: 0.7 }) }] } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await parseReceiptWithOCR(Buffer.from("%PDF"), "application/pdf", { provider: "gemini" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(body)).toContain("inlineData");
    expect(JSON.stringify(body)).toContain("application/pdf");

    vi.unstubAllGlobals();
    delete (envMod.env as Record<string, unknown>).GEMINI_API_KEY;
    delete (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER;
    Object.assign(envMod.env, original);
  });

  it("falls back to the next Gemini model when one returns a 429 quota error", async () => {
    const envMod = await import("@/lib/env");
    const original = { ...envMod.env } as Record<string, unknown>;
    (envMod.env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
    (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER = "gemini";
    (envMod.env as Record<string, unknown>).GEMINI_OCR_MODELS = "gemini-2.0-flash,gemini-1.5-flash";

    const quotaBody = JSON.stringify({
      error: {
        code: 429,
        message: "Quota exceeded ... limit: 0, model: gemini-2.0-flash",
        status: "RESOURCE_EXHAUSTED",
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: "Too Many Requests", text: async () => quotaBody })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ vendor: "Fallback Mart", confidence: 0.9 }) }] } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await parseReceiptWithOCR(fakeImage, "image/png");

    expect(result.vendor).toBe("Fallback Mart");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("models/gemini-2.0-flash:");
    expect(String(fetchMock.mock.calls[1][0])).toContain("models/gemini-1.5-flash:");

    vi.unstubAllGlobals();
    delete (envMod.env as Record<string, unknown>).GEMINI_API_KEY;
    delete (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER;
    delete (envMod.env as Record<string, unknown>).GEMINI_OCR_MODELS;
    Object.assign(envMod.env, original);
  });

  it("throws a rate-limit error when every Gemini model is exhausted", async () => {
    const envMod = await import("@/lib/env");
    const original = { ...envMod.env } as Record<string, unknown>;
    (envMod.env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
    (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER = "gemini";
    (envMod.env as Record<string, unknown>).GEMINI_OCR_MODELS = "gemini-2.0-flash,gemini-1.5-flash";

    const quotaBody = JSON.stringify({ error: { code: 429, message: "Quota exceeded ... limit: 0" } });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests", text: async () => quotaBody });
    vi.stubGlobal("fetch", fetchMock);

    await expect(parseReceiptWithOCR(fakeImage, "image/png")).rejects.toThrow(/rate-limited/);
    // Each model tried once — "limit: 0" is non-retryable, so no extra attempts.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
    delete (envMod.env as Record<string, unknown>).GEMINI_API_KEY;
    delete (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER;
    delete (envMod.env as Record<string, unknown>).GEMINI_OCR_MODELS;
    Object.assign(envMod.env, original);
  });

  it("does not try other Gemini models on a non-429 error", async () => {
    const envMod = await import("@/lib/env");
    const original = { ...envMod.env } as Record<string, unknown>;
    (envMod.env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
    (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER = "gemini";
    (envMod.env as Record<string, unknown>).GEMINI_OCR_MODELS = "gemini-2.0-flash,gemini-1.5-flash";

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, statusText: "Bad Request", text: async () => "invalid request" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(parseReceiptWithOCR(fakeImage, "image/png")).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    delete (envMod.env as Record<string, unknown>).GEMINI_API_KEY;
    delete (envMod.env as Record<string, unknown>).RECEIPT_OCR_PROVIDER;
    delete (envMod.env as Record<string, unknown>).GEMINI_OCR_MODELS;
    Object.assign(envMod.env, original);
  });

  it("throws if ANTHROPIC_API_KEY is not set", async () => {
    // Re-mock env without key
    const envMod = await import("@/lib/env");
    const original = envMod.env.ANTHROPIC_API_KEY;
    (envMod.env as Record<string, unknown>).ANTHROPIC_API_KEY = undefined;

    await expect(parseReceiptWithOCR(fakeImage, "image/png")).rejects.toThrow(
      "ANTHROPIC_API_KEY is not configured",
    );

    (envMod.env as Record<string, unknown>).ANTHROPIC_API_KEY = original;
  });
});

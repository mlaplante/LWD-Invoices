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

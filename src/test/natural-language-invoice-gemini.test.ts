import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "@/lib/env";
import {
  extractGeminiText,
  extractNaturalLanguageInvoice,
  normalizeExtraction,
  resolveInvoiceParserProvider,
} from "@/server/services/natural-language-invoice";

// A Gemini generateContent response wrapping the model's JSON text.
function geminiResponse(jsonText: string) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: jsonText }] } }],
    }),
  };
}

describe("natural-language invoice — Gemini provider", () => {
  const originalProvider = env.INVOICE_PARSER_PROVIDER;
  const originalGeminiKey = env.GEMINI_API_KEY;
  const originalOpenAIKey = env.OPENAI_API_KEY;
  const originalGeminiModels = env.GEMINI_INVOICE_PARSER_MODELS;

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    (env as Record<string, unknown>).INVOICE_PARSER_PROVIDER = originalProvider;
    (env as Record<string, unknown>).GEMINI_API_KEY = originalGeminiKey;
    (env as Record<string, unknown>).OPENAI_API_KEY = originalOpenAIKey;
    (env as Record<string, unknown>).GEMINI_INVOICE_PARSER_MODELS = originalGeminiModels;
  });

  describe("resolveInvoiceParserProvider", () => {
    it("honors an explicit override", () => {
      expect(resolveInvoiceParserProvider("gemini")).toBe("gemini");
    });

    it("uses INVOICE_PARSER_PROVIDER when set", () => {
      (env as Record<string, unknown>).INVOICE_PARSER_PROVIDER = "gemini";
      expect(resolveInvoiceParserProvider()).toBe("gemini");
    });

    it("falls back to gemini when only GEMINI_API_KEY is present", () => {
      (env as Record<string, unknown>).INVOICE_PARSER_PROVIDER = undefined;
      (env as Record<string, unknown>).OPENAI_API_KEY = undefined;
      (env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
      expect(resolveInvoiceParserProvider()).toBe("gemini");
      (env as Record<string, unknown>).OPENAI_API_KEY = "test-openai-key";
    });

    it("prefers gemini over openai when both keys are present (Gemini-first default)", () => {
      (env as Record<string, unknown>).INVOICE_PARSER_PROVIDER = undefined;
      (env as Record<string, unknown>).OPENAI_API_KEY = "test-openai-key";
      (env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
      expect(resolveInvoiceParserProvider()).toBe("gemini");
    });

    it("uses openai only when it is the sole configured key", () => {
      (env as Record<string, unknown>).INVOICE_PARSER_PROVIDER = undefined;
      (env as Record<string, unknown>).GEMINI_API_KEY = undefined;
      (env as Record<string, unknown>).OPENAI_API_KEY = "test-openai-key";
      expect(resolveInvoiceParserProvider()).toBe("openai");
    });
  });

  describe("extractGeminiText", () => {
    it("concatenates text parts and ignores malformed candidates", () => {
      expect(
        extractGeminiText({
          candidates: [
            { content: { parts: [{ text: "{\"client" }, { text: "Name\":null}" }] } },
            null,
            { content: {} },
          ],
        }),
      ).toBe("{\"clientName\":null}");
    });

    it("returns empty string when there are no candidates", () => {
      expect(extractGeminiText({})).toBe("");
    });
  });

  describe("normalizeExtraction", () => {
    it("coerces nullable fields to undefined and defaults arrays", () => {
      const result = normalizeExtraction(
        JSON.stringify({
          clientName: null,
          lines: [{ name: "Design", description: null, quantity: 8, unit: null, rate: 120, lineType: null, confidence: null }],
          notes: null,
          dueDate: null,
          taxNames: null,
          ambiguities: null,
          confidence: 0.9,
        }),
      );

      expect(result.clientName).toBeUndefined();
      expect(result.taxNames).toEqual([]);
      expect(result.ambiguities).toEqual([]);
      expect(result.lines[0]).toMatchObject({ name: "Design", quantity: 8, rate: 120 });
      expect(result.lines[0].description).toBeUndefined();
      expect(result.lines[0].lineType).toBeUndefined();
    });
  });

  describe("extractNaturalLanguageInvoice (gemini path)", () => {
    it("calls the Gemini generateContent API and normalizes its JSON", async () => {
      (env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
      const fetchMock = vi.fn().mockResolvedValue(
        geminiResponse(
          JSON.stringify({
            clientName: "Acme",
            lines: [{ name: "Design", description: null, quantity: 4, unit: "hours", rate: 100, lineType: "standard", confidence: 0.8 }],
            notes: null,
            dueDate: "2026-07-01",
            taxNames: [],
            ambiguities: [],
            confidence: 0.88,
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await extractNaturalLanguageInvoice("Bill Acme 4 hrs design at $100", { provider: "gemini" });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain("generativelanguage.googleapis.com");
      expect(url).toContain(":generateContent");
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini");
      expect(result.clientName).toBe("Acme");
      expect(result.dueDate).toBe("2026-07-01");
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toMatchObject({ name: "Design", quantity: 4, rate: 100 });
    });

    it("throws when GEMINI_API_KEY is missing", async () => {
      (env as Record<string, unknown>).GEMINI_API_KEY = undefined;
      await expect(
        extractNaturalLanguageInvoice("Bill Acme", { provider: "gemini" }),
      ).rejects.toThrow(/GEMINI_API_KEY/);
    });
  });

  describe("Gemini model fallback chain", () => {
    const okResponse = () =>
      geminiResponse(JSON.stringify({ clientName: "Acme", lines: [], notes: null, dueDate: null, taxNames: [], ambiguities: [], confidence: 0.9 }));
    // "limit: 0" marks a daily/hard quota — non-retryable, so the loop moves to
    // the next model immediately without sleeping.
    const exhausted429 = () => ({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => JSON.stringify({ error: { code: 429, message: "Quota exceeded ... limit: 0" } }),
    });

    beforeEach(() => {
      (env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
      (env as Record<string, unknown>).GEMINI_INVOICE_PARSER_MODELS = "gemini-2.0-flash,gemini-1.5-flash";
    });

    it("falls through to the next model on a 429 and succeeds", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(exhausted429()).mockResolvedValueOnce(okResponse());
      vi.stubGlobal("fetch", fetchMock);

      const result = await extractNaturalLanguageInvoice("Bill Acme", { provider: "gemini" });

      expect(result.clientName).toBe("Acme");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[0][0])).toContain("models/gemini-2.0-flash:");
      expect(String(fetchMock.mock.calls[1][0])).toContain("models/gemini-1.5-flash:");
    });

    it("throws a rate-limit error when every model is exhausted", async () => {
      const fetchMock = vi.fn().mockResolvedValue(exhausted429());
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        extractNaturalLanguageInvoice("Bill Acme", { provider: "gemini" }),
      ).rejects.toThrow(/rate-limited/);
      // Each model tried once — "limit: 0" is non-retryable, no extra attempts.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not try other models on a non-429 error", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "invalid request",
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        extractNaturalLanguageInvoice("Bill Acme", { provider: "gemini" }),
      ).rejects.toThrow(/400/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries the final model with a capped backoff on a retryable 429", async () => {
      vi.useFakeTimers();
      // Single-model chain so model 1 is also the last model (the only one that
      // retries). A RetryInfo delay with no "limit: 0" is retryable.
      (env as Record<string, unknown>).GEMINI_INVOICE_PARSER_MODELS = "gemini-2.0-flash";
      const retryable429 = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => JSON.stringify({
          error: {
            code: 429,
            message: "Rate limited",
            details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1s" }],
          },
        }),
      };
      const fetchMock = vi.fn().mockResolvedValueOnce(retryable429).mockResolvedValueOnce(okResponse());
      vi.stubGlobal("fetch", fetchMock);

      const promise = extractNaturalLanguageInvoice("Bill Acme", { provider: "gemini" });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.clientName).toBe("Acme");
      // Same model retried after the backoff sleep.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1][0])).toContain("models/gemini-2.0-flash:");
    });
  });
});

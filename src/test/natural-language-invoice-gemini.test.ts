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

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    (env as Record<string, unknown>).INVOICE_PARSER_PROVIDER = originalProvider;
    (env as Record<string, unknown>).GEMINI_API_KEY = originalGeminiKey;
    (env as Record<string, unknown>).OPENAI_API_KEY = originalOpenAIKey;
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
});

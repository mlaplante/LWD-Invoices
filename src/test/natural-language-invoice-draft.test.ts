import { afterEach, describe, expect, it, vi } from "vitest";
import { InvoiceStatus, LineType } from "@/generated/prisma";
import { env } from "@/lib/env";
import {
  buildNaturalLanguageInvoiceDraft,
  extractNaturalLanguageInvoiceWithOpenAI,
  type NaturalLanguageInvoiceExtraction,
  type NaturalLanguageInvoiceContext,
} from "@/server/services/natural-language-invoice";

// The service reads keys/models from the validated env object (cached at load),
// so mutate that — not process.env — and restore afterEach.
const originalOpenAIKey = env.OPENAI_API_KEY;
const originalOpenAIModel = env.OPENAI_INVOICE_PARSER_MODEL;

const context: NaturalLanguageInvoiceContext = {
  defaultCurrencyId: "usd",
  clients: [
    { id: "client_acme", name: "Acme" },
    { id: "client_acme_studio", name: "Acme Studio" },
    { id: "client_beta", name: "Beta Co" },
  ],
  items: [
    { id: "item_design", name: "Design", description: "Product design", rate: 120, unit: "hour" },
    { id: "item_figma", name: "Figma license", description: "Monthly Figma seat", rate: 15, unit: "license" },
    { id: "item_research", name: "Research", description: "UX research", rate: 150, unit: "hour" },
  ],
  taxes: [
    { id: "tax_hst", name: "HST", rate: 0.13 },
  ],
};

function extraction(overrides: Partial<NaturalLanguageInvoiceExtraction> = {}): NaturalLanguageInvoiceExtraction {
  return {
    clientName: "Acme",
    lines: [
      { name: "Design", quantity: 8, unit: "hours", rate: 120 },
      { name: "Figma license", quantity: 1 },
    ],
    notes: undefined,
    dueDate: undefined,
    taxNames: [],
    ambiguities: [],
    confidence: 0.92,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  (env as Record<string, unknown>).OPENAI_API_KEY = originalOpenAIKey;
  (env as Record<string, unknown>).OPENAI_INVOICE_PARSER_MODEL = originalOpenAIModel;
});

describe("buildNaturalLanguageInvoiceDraft", () => {
  it("creates a reviewable draft from a typical prompt without saving or sending it", () => {
    const draft = buildNaturalLanguageInvoiceDraft({
      prompt: "Bill Acme 8 hrs design at $120 plus the Figma license",
      extraction: extraction(),
      context,
    });

    expect(draft.status).toBe(InvoiceStatus.DRAFT);
    expect(draft.requiresReview).toBe(true);
    expect(draft.clientId).toBe("client_acme");
    expect(draft.currencyId).toBe("usd");
    expect(draft.lines).toEqual([
      expect.objectContaining({
        name: "Design",
        qty: 8,
        rate: 120,
        lineType: LineType.STANDARD,
        sourceTable: "items",
        sourceId: "item_design",
        matchConfidence: expect.any(Number),
      }),
      expect.objectContaining({
        name: "Figma license",
        qty: 1,
        rate: 15,
        sourceTable: "items",
        sourceId: "item_figma",
      }),
    ]);
  });

  it("matches parsed lines to the item library when names are close and preserves matched item rate", () => {
    const draft = buildNaturalLanguageInvoiceDraft({
      prompt: "Invoice Acme for 3 hours UX design",
      extraction: extraction({ lines: [{ name: "UX design", quantity: 3, unit: "hours" }] }),
      context,
    });

    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({
      name: "Design",
      qty: 3,
      rate: 120,
      sourceTable: "items",
      sourceId: "item_design",
    });
    expect(draft.lines[0].warnings).toContain("Matched 'UX design' to item 'Design'.");
  });

  it("surfaces ambiguous customer and item matches instead of selecting them silently", () => {
    const draft = buildNaturalLanguageInvoiceDraft({
      prompt: "Bill Acme for discovery",
      extraction: extraction({
        clientName: "Acme",
        lines: [{ name: "discovery", quantity: 1, rate: 500 }],
        confidence: 0.61,
      }),
      context: {
        ...context,
        items: [
          ...context.items,
          { id: "item_discovery_workshop", name: "Discovery workshop", rate: 500, unit: "flat" },
          { id: "item_discovery_sprint", name: "Discovery sprint", rate: 2500, unit: "flat" },
        ],
      },
    });

    expect(draft.clientId).toBeUndefined();
    expect(draft.ambiguities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "client", message: expect.stringContaining("Multiple clients") }),
        expect.objectContaining({ field: "line[0].item", message: expect.stringContaining("Multiple items") }),
      ]),
    );
    expect(draft.requiresReview).toBe(true);
  });

  it("keeps multi-line prompts ordered and carries notes, due date, taxes, and expenses", () => {
    const draft = buildNaturalLanguageInvoiceDraft({
      prompt: "Bill Beta Co\n- 4 hrs research at $150\n- Figma license $15\nDue July 15. Add HST. Note: Thanks!",
      extraction: extraction({
        clientName: "Beta Co",
        lines: [
          { name: "Research", quantity: 4, unit: "hours", rate: 150 },
          { name: "Figma license", quantity: 1, rate: 15, lineType: "expense" },
        ],
        dueDate: "2026-07-15",
        notes: "Thanks!",
        taxNames: ["HST"],
      }),
      context,
    });

    expect(draft.clientId).toBe("client_beta");
    expect(draft.dueDate).toBe("2026-07-15");
    expect(draft.notes).toBe("Thanks!");
    expect(draft.lines.map((line) => line.sort)).toEqual([0, 1]);
    expect(draft.lines[0]).toMatchObject({ name: "Research", taxIds: ["tax_hst"] });
    expect(draft.lines[1]).toMatchObject({ name: "Figma license", lineType: LineType.EXPENSE, taxIds: ["tax_hst"] });
  });

  it("creates freeform draft lines and confidence warnings when no confident item match exists", () => {
    const draft = buildNaturalLanguageInvoiceDraft({
      prompt: "Bill Acme 2 hours emergency launch support at $200",
      extraction: extraction({
        lines: [{ name: "Emergency launch support", quantity: 2, unit: "hours", rate: 200, confidence: 0.55 }],
      }),
      context,
    });

    expect(draft.lines[0]).toMatchObject({
      name: "Emergency launch support",
      qty: 2,
      rate: 200,
      sourceTable: undefined,
      sourceId: undefined,
    });
    expect(draft.ambiguities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "line[0]", message: expect.stringContaining("Low confidence") }),
      ]),
    );
  });
});

describe("extractNaturalLanguageInvoiceWithOpenAI", () => {
  it("fails before making a network request when OPENAI_API_KEY is not configured", async () => {
    (env as Record<string, unknown>).OPENAI_API_KEY = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractNaturalLanguageInvoiceWithOpenAI("Bill Acme for design")).rejects.toThrow(
      "OPENAI_API_KEY is not configured",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the configured OpenAI key and model while parsing mocked JSON output", async () => {
    (env as Record<string, unknown>).OPENAI_API_KEY = "test-openai-key";
    (env as Record<string, unknown>).OPENAI_INVOICE_PARSER_MODEL = "test-invoice-model";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          clientName: "Acme",
          lines: [{ name: "Design", description: null, quantity: 2, unit: "hours", rate: 100, lineType: null, confidence: 0.88 }],
          notes: null,
          dueDate: null,
          taxNames: [],
          ambiguities: [],
          confidence: 0.9,
        }),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const parsed = await extractNaturalLanguageInvoiceWithOpenAI("Bill Acme for 2 hours design");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-openai-key" }),
      }),
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.model).toBe("test-invoice-model");
    expect(parsed).toMatchObject({
      clientName: "Acme",
      lines: [expect.objectContaining({ name: "Design", quantity: 2, rate: 100 })],
    });
    expect(parsed.lines[0].description).toBeUndefined();
    expect(parsed.lines[0].lineType).toBeUndefined();
  });
});

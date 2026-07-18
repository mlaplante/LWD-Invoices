import { describe, it, expect, afterEach, vi } from "vitest";
import { env } from "@/lib/env";
import {
  executeBooksAssistantTool,
  geminiFunctionDeclarations,
  resolveAssistantProvider,
  streamBooksAssistant,
  type BooksAssistantStreamEvent,
} from "@/server/services/books-assistant";

describe("report-shaped assistant tools", () => {
  it("returns org-scoped payment lateness history and filters to late payments", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        amount: 100,
        paidAt: new Date("2026-06-20T00:00:00.000Z"),
        invoice: { number: "INV-10", dueDate: new Date("2026-06-10T00:00:00.000Z"), clientId: "client-1", client: { name: "Acme" } },
      },
      {
        amount: 50,
        paidAt: new Date("2026-06-15T00:00:00.000Z"),
        invoice: { number: "INV-11", dueDate: new Date("2026-06-15T00:00:00.000Z"), clientId: "client-2", client: { name: "Globex" } },
      },
    ]);
    const ctx = { db: { payment: { findMany } } as never, orgId: "org-1" };
    const now = new Date("2026-07-18T00:00:00.000Z");

    const all = await executeBooksAssistantTool("get_payment_history", { period: "last_90_days" }, ctx, now);
    const late = await executeBooksAssistantTool("get_payment_history", { period: "last_90_days", onlyLate: true }, ctx, now);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org-1" }),
    }));
    expect(all).toMatchObject({
      summary: { count: 2, totalCollected: 150, lateCount: 1, averageDaysLate: 10 },
      payments: expect.arrayContaining([expect.objectContaining({ invoiceNumber: "INV-10", daysLate: 10, paidLate: true })]),
    });
    expect(late).toMatchObject({
      summary: { count: 1, totalCollected: 100, lateCount: 1, averageDaysLate: 10 },
      payments: [expect.objectContaining({ invoiceNumber: "INV-10" })],
    });
  });

  it("groups period expenses by category and reports the top suppliers", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { qty: 2, rate: 100, category: { name: "Software" }, supplier: { name: "Linear" } },
      { qty: 1, rate: 75, category: { name: "Software" }, supplier: { name: "Figma" } },
      { qty: 1, rate: 50, category: { name: "Travel" }, supplier: { name: "Delta" } },
    ]);
    const ctx = { db: { expense: { findMany } } as never, orgId: "org-1" };

    const result = await executeBooksAssistantTool(
      "get_expense_summary",
      { period: "last_90_days" },
      ctx,
      new Date("2026-07-18T00:00:00.000Z"),
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org-1" }),
    }));
    expect(result).toMatchObject({
      totalSpent: 325,
      byCategory: [
        { category: "Software", total: 275, count: 2 },
        { category: "Travel", total: 50, count: 1 },
      ],
      topSuppliers: [
        { supplier: "Linear", total: 200 },
        { supplier: "Figma", total: 75 },
        { supplier: "Delta", total: 50 },
      ],
    });
  });

  it("summarizes issued invoices by status and excludes credit notes from billed totals", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { number: "INV-1", total: 300, status: "SENT", client: { name: "Acme" } },
      { number: "INV-2", total: 100, status: "DRAFT", client: { name: "Globex" } },
    ]);
    const ctx = { db: { invoice: { findMany } } as never, orgId: "org-1" };

    const result = await executeBooksAssistantTool(
      "get_invoice_stats",
      { period: "last_90_days" },
      ctx,
      new Date("2026-07-18T00:00:00.000Z"),
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: "org-1",
        isArchived: false,
        type: { not: "CREDIT_NOTE" },
      }),
    }));
    expect(result).toMatchObject({
      count: 2,
      totalBilled: 400,
      averageValue: 200,
      byStatus: { SENT: 1, DRAFT: 1 },
      largest: [
        { number: "INV-1", client: "Acme", total: 300, status: "SENT" },
        { number: "INV-2", client: "Globex", total: 100, status: "DRAFT" },
      ],
    });
  });
});

// Build a fake Gemini SSE Response that emits the given chunks as `data:` lines.
function sseResponse(chunks: object[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ch of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(ch)}\n`));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

function textChunk(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

describe("geminiFunctionDeclarations", () => {
  it("projects every tool into a Gemini function declaration with uppercase types", () => {
    const decls = geminiFunctionDeclarations();
    expect(decls.length).toBeGreaterThan(0);
    for (const d of decls) {
      expect(typeof d.name).toBe("string");
      expect(typeof d.description).toBe("string");
      expect((d.parameters as { type: string }).type).toBe("OBJECT");
    }
  });

  it("uppercases nested property types and preserves enums", () => {
    const revenue = geminiFunctionDeclarations().find((d) => d.name === "get_revenue_summary");
    expect(revenue).toBeDefined();
    const params = revenue!.parameters as {
      properties: { period: { type: string; enum: string[] } };
      required: string[];
    };
    expect(params.properties.period.type).toBe("STRING");
    expect(params.properties.period.enum).toContain("last_quarter");
    expect(params.required).toContain("period");
  });

  it("maps integer limit params to INTEGER", () => {
    const ar = geminiFunctionDeclarations().find((d) => d.name === "get_accounts_receivable");
    const params = ar!.parameters as { properties: { limit: { type: string } } };
    expect(params.properties.limit.type).toBe("INTEGER");
  });
});

describe("resolveAssistantProvider", () => {
  const originalProvider = env.ASSISTANT_AI_PROVIDER;
  const originalGemini = env.GEMINI_API_KEY;
  const originalAnthropic = env.ANTHROPIC_API_KEY;

  afterEach(() => {
    (env as Record<string, unknown>).ASSISTANT_AI_PROVIDER = originalProvider;
    (env as Record<string, unknown>).GEMINI_API_KEY = originalGemini;
    (env as Record<string, unknown>).ANTHROPIC_API_KEY = originalAnthropic;
  });

  it("prefers Gemini when both keys are present (Gemini-first default)", () => {
    (env as Record<string, unknown>).ASSISTANT_AI_PROVIDER = undefined;
    (env as Record<string, unknown>).GEMINI_API_KEY = "g";
    (env as Record<string, unknown>).ANTHROPIC_API_KEY = "a";
    expect(resolveAssistantProvider()).toBe("gemini");
  });

  it("falls back to Anthropic when only its key is set", () => {
    (env as Record<string, unknown>).ASSISTANT_AI_PROVIDER = undefined;
    (env as Record<string, unknown>).GEMINI_API_KEY = undefined;
    (env as Record<string, unknown>).ANTHROPIC_API_KEY = "a";
    expect(resolveAssistantProvider()).toBe("anthropic");
  });

  it("honors an explicit provider override when its key is present", () => {
    (env as Record<string, unknown>).ASSISTANT_AI_PROVIDER = "anthropic";
    (env as Record<string, unknown>).GEMINI_API_KEY = "g";
    (env as Record<string, unknown>).ANTHROPIC_API_KEY = "a";
    expect(resolveAssistantProvider()).toBe("anthropic");
  });

  it("returns null when no provider key is configured", () => {
    (env as Record<string, unknown>).ASSISTANT_AI_PROVIDER = undefined;
    (env as Record<string, unknown>).GEMINI_API_KEY = undefined;
    (env as Record<string, unknown>).ANTHROPIC_API_KEY = undefined;
    expect(resolveAssistantProvider()).toBeNull();
  });
});

describe("streamBooksAssistant — Gemini streaming", () => {
  const originalProvider = env.ASSISTANT_AI_PROVIDER;
  const originalGemini = env.GEMINI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    (env as Record<string, unknown>).ASSISTANT_AI_PROVIDER = originalProvider;
    (env as Record<string, unknown>).GEMINI_API_KEY = originalGemini;
  });

  it("streams the answer as deltas then a done event (no tool calls)", async () => {
    (env as Record<string, unknown>).ASSISTANT_AI_PROVIDER = "gemini";
    (env as Record<string, unknown>).GEMINI_API_KEY = "test-gemini";
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([textChunk("Acme owes "), textChunk("$1,200.")]));
    vi.stubGlobal("fetch", fetchMock);

    const events: BooksAssistantStreamEvent[] = [];
    // db is unused on the no-tool path.
    for await (const e of streamBooksAssistant({ db: {} as never, orgId: "org1" }, [
      { role: "user", content: "Who owes me money?" },
    ])) {
      events.push(e);
    }

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("streamGenerateContent");
    const deltas = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text);
    expect(deltas.join("")).toBe("Acme owes $1,200.");
    expect(events[events.length - 1]).toEqual({ type: "done", toolCalls: [] });
  });

  it("surfaces a friendly message when no provider key is configured", async () => {
    (env as Record<string, unknown>).ASSISTANT_AI_PROVIDER = undefined;
    (env as Record<string, unknown>).GEMINI_API_KEY = undefined;
    const original = env.ANTHROPIC_API_KEY;
    (env as Record<string, unknown>).ANTHROPIC_API_KEY = undefined;

    const events: BooksAssistantStreamEvent[] = [];
    for await (const e of streamBooksAssistant({ db: {} as never, orgId: "org1" }, [
      { role: "user", content: "hi" },
    ])) {
      events.push(e);
    }
    expect((events[0] as { text: string }).text).toContain("needs an AI provider key");
    (env as Record<string, unknown>).ANTHROPIC_API_KEY = original;
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { env } from "@/lib/env";
import {
  geminiFunctionDeclarations,
  resolveAssistantProvider,
  streamBooksAssistant,
  type BooksAssistantStreamEvent,
} from "@/server/services/books-assistant";

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

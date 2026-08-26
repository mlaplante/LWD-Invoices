import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  GEMINI_DEFAULT_MODELS,
  callGeminiWithModelFallback,
  extractGeminiText,
  streamGeminiGenerateContent,
} from "@/server/services/gemini-fallback";

// Google retires model ids on its own schedule and answers a retired id with a
// 404 ("This model models/gemini-2.0-flash is no longer available. Please update
// your code to use models/gemini-3.6-flash"). Before Aug 2026 the runner treated
// any non-429 as fatal, so a retired *primary* model took down every AI feature
// even though the rest of the chain was healthy. These tests pin the recovery.
function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    statusText: String(status),
    text: async () => JSON.stringify({ error: { code: status, message, status: "NOT_FOUND" } }),
  };
}

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

const RETIRED =
  "This model models/gemini-2.0-flash is no longer available. Please update your code to use models/gemini-3.6-flash for the latest features and improvements.";

describe("gemini-fallback model chain", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls through a retired (404) model to the next model in the chain", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(404, RETIRED))
      .mockResolvedValueOnce(okResponse("drafted"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGeminiWithModelFallback<string>({
      apiKey: "k",
      models: ["gemini-retired", "gemini-live"],
      body: { contents: [] },
      label: "test",
      onOk: extractGeminiText,
    });

    expect(result).toBe("drafted");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("models/gemini-retired:");
    expect(String(fetchMock.mock.calls[1][0])).toContain("models/gemini-live:");
  });

  it("falls through a 503 overloaded model to the next model", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503, "This model is currently experiencing high demand."))
      .mockResolvedValueOnce(okResponse("drafted"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callGeminiWithModelFallback<string>({
        apiKey: "k",
        models: ["gemini-busy", "gemini-live"],
        body: { contents: [] },
        label: "test",
        onOk: extractGeminiText,
      }),
    ).resolves.toBe("drafted");
  });

  it("names every model and status when the whole chain fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(404, RETIRED));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callGeminiWithModelFallback<string>({
        apiKey: "k",
        models: ["gemini-dead-a", "gemini-dead-b"],
        body: { contents: [] },
        label: "test",
        onOk: extractGeminiText,
      }),
    ).rejects.toThrow(/gemini-dead-a \(404\)[\s\S]*gemini-dead-b \(404\)/);
  });

  it("fails immediately on a non-fallback status without trying other models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401, "API key not valid"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callGeminiWithModelFallback<string>({
        apiKey: "bad",
        models: ["gemini-a", "gemini-b"],
        body: { contents: [] },
        label: "test",
        onOk: extractGeminiText,
      }),
    ).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("streams from the next model when the first is retired (404)", async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}\n';
    const streamResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(sse) };
            },
          };
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(404, RETIRED))
      .mockResolvedValueOnce(streamResponse);
    vi.stubGlobal("fetch", fetchMock);

    const chunks: Record<string, unknown>[] = [];
    for await (const chunk of streamGeminiGenerateContent({
      apiKey: "k",
      models: ["gemini-retired", "gemini-live"],
      body: { contents: [] },
      label: "test",
    })) {
      chunks.push(chunk);
    }

    expect(chunks.map(extractGeminiText)).toEqual(["hello", " world"]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("models/gemini-live:streamGenerateContent");
  });

  it("names every model when the whole streaming chain fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(503, "high demand")));

    const run = async () => {
      for await (const _chunk of streamGeminiGenerateContent({
        apiKey: "k",
        models: ["gemini-busy-a", "gemini-busy-b"],
        body: { contents: [] },
        label: "test",
      })) {
        // no chunks expected
      }
    };

    await expect(run()).rejects.toThrow(/gemini-busy-a \(503\)[\s\S]*gemini-busy-b \(503\)/);
  });

  it("ships a default chain with no retired model ids", () => {
    expect(GEMINI_DEFAULT_MODELS.length).toBeGreaterThan(1);
    for (const model of GEMINI_DEFAULT_MODELS) {
      // gemini-1.x and 2.0 are retired; a chain starting on one of them is the
      // exact outage this module now guards against.
      expect(model).not.toMatch(/^gemini-(1\.\d|2\.0)/);
    }
  });
});

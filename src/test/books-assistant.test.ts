import { describe, it, expect, afterEach } from "vitest";
import { env } from "@/lib/env";
import {
  geminiFunctionDeclarations,
  resolveAssistantProvider,
} from "@/server/services/books-assistant";

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

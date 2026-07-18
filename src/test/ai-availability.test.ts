import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {},
}));

describe("ai-availability", () => {
  beforeEach(async () => {
    const { env } = await import("@/lib/env");
    Object.assign(env, {
      GEMINI_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
    });
  });

  it("reports no providers when no keys are set", async () => {
    const { getAiAvailability } = await import("@/server/services/ai-availability");

    expect(getAiAvailability()).toEqual({
      gemini: false,
      openai: false,
      anthropic: false,
      anyConfigured: false,
    });
  });

  it("reports anyConfigured when at least one key is set", async () => {
    const { env } = await import("@/lib/env");
    const { getAiAvailability } = await import("@/server/services/ai-availability");
    Object.assign(env, { GEMINI_API_KEY: "x" });

    expect(getAiAvailability().anyConfigured).toBe(true);
    expect(getAiAvailability().gemini).toBe(true);
  });
});

import { env } from "@/lib/env";

export type AiAvailability = {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
  anyConfigured: boolean;
};

export function getAiAvailability(): AiAvailability {
  const gemini = Boolean(env.GEMINI_API_KEY);
  const openai = Boolean(env.OPENAI_API_KEY);
  const anthropic = Boolean(env.ANTHROPIC_API_KEY);
  return { gemini, openai, anthropic, anyConfigured: gemini || openai || anthropic };
}

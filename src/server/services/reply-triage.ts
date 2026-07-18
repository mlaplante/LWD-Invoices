import { z } from "zod";
import { env } from "@/lib/env";
import { getAiAvailability } from "./ai-availability";
import { parseValidatedJson } from "./ai-structured-output";
import { callGeminiWithModelFallback, extractGeminiText, resolveGeminiModels } from "./gemini-fallback";
import { SUGGESTED_ACTIONS } from "@/lib/reply-triage-actions";

export const triageOutputSchema = z.object({
  category: z.enum(["PROMISE_TO_PAY", "DISPUTE", "QUESTION", "INFO_UPDATE", "NEEDS_REVIEW"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(1000),
  promisedDate: z.string().nullable().optional(),
});
export type TriageOutput = z.infer<typeof triageOutputSchema>;
export const MIN_CONFIDENCE = 0.6;
export { SUGGESTED_ACTIONS };

export function finalizeTriage(raw: unknown) {
  const parsed = typeof raw === "string" ? (() => { try { return parseValidatedJson(raw, triageOutputSchema); } catch { return null; } })() : triageOutputSchema.safeParse(raw).data;
  if (!parsed) return { category: "NEEDS_REVIEW" as const, confidence: 0, reasoning: "AI output could not be validated.", promisedDate: null, source: "fallback_invalid_output" as const };
  if (parsed.confidence < MIN_CONFIDENCE) return { category: "NEEDS_REVIEW" as const, confidence: parsed.confidence, reasoning: parsed.reasoning, promisedDate: null, source: "fallback_low_confidence" as const };
  const date = parsed.category === "PROMISE_TO_PAY" && parsed.promisedDate ? new Date(parsed.promisedDate) : null;
  return { category: parsed.category, confidence: parsed.confidence, reasoning: parsed.reasoning, promisedDate: date && !Number.isNaN(date.getTime()) ? date : null, source: "ai" as const };
}

export async function classifyReply(input: { bodyText: string; subject: string | null; invoiceContext: { number: string; total: number; dueDate: Date | null; status: string } | null; }): Promise<ReturnType<typeof finalizeTriage> | { skipped: true }> {
  if (!getAiAvailability().gemini || !env.GEMINI_API_KEY) return { skipped: true };
  const invoice = input.invoiceContext ? `Invoice ${input.invoiceContext.number}, total ${input.invoiceContext.total}, due ${input.invoiceContext.dueDate?.toISOString() ?? "unknown"}, status ${input.invoiceContext.status}.` : "No invoice is linked.";
  const prompt = `Classify this inbound client reply. Return JSON only with category, confidence, reasoning, promisedDate. Categories: PROMISE_TO_PAY, DISPUTE, QUESTION, INFO_UPDATE, NEEDS_REVIEW. ${invoice} If ambiguous, mixed, or automated/out-of-office, use NEEDS_REVIEW with low confidence. Subject: ${input.subject ?? ""}\nReply: ${input.bodyText.slice(0, 4000)}`;
  try {
    const raw = await callGeminiWithModelFallback<string>({ apiKey: env.GEMINI_API_KEY, models: resolveGeminiModels(process.env.GEMINI_REPLY_TRIAGE_MODELS, ["gemini-2.0-flash", "gemini-1.5-flash"]), body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }, label: "reply triage", onOk: extractGeminiText });
    return finalizeTriage(raw);
  } catch { return finalizeTriage(null); }
}

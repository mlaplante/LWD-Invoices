import { z } from "zod";

/**
 * Thrown when a model's raw output can't be parsed or doesn't match the schema.
 * Callers catch this and fall back to deterministic behavior rather than
 * surfacing a half-parsed AI result. Shared by every AI feature so they all
 * fail the same way (mirrors the normalizeExtraction discipline in
 * natural-language-invoice.ts).
 */
export class AiOutputError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AiOutputError";
  }
}

/** Parse a raw model JSON string and validate it against `schema`. */
export function parseValidatedJson<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AiOutputError("model output was not valid JSON", err);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiOutputError(`model output failed schema validation: ${result.error.message}`);
  }
  return result.data;
}

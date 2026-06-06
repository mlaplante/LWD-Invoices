/**
 * Answer-grounding check for the read-only books assistant.
 *
 * The assistant's system prompt says "never invent figures". This is the
 * deterministic guard that verifies it: every dollar figure the model states in
 * its answer must trace back to a number actually present in the tool results it
 * was given. It's the assistant-side analog of the reminder fact-guard
 * (`containsHallucinatedInvoiceFacts`).
 *
 * Scope is intentionally limited to `$`-prefixed monetary figures. Bare integers
 * ("3 invoices", "21 days", the year "2026") are far too noisy to ground
 * reliably and aren't the dangerous failure mode — a fabricated *dollar amount*
 * is. Keeping the check tight keeps false positives near zero, which is what
 * makes it safe to one day wire into the live stream as a guard rather than only
 * a regression metric.
 */

const MONEY_TOKEN_RE = /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\s?\d+(?:\.\d+)?/g;

export interface GroundingResult {
  grounded: boolean;
  /** Dollar figures stated in the answer with no supporting value in the data. */
  unsupportedFigures: number[];
  /** Every dollar figure parsed from the answer (for diagnostics). */
  statedFigures: number[];
}

/**
 * @param answer       The assistant's natural-language reply.
 * @param toolResults  The raw objects returned by the tools that ran for this
 *                     answer (each tool's JSON result).
 */
export function checkAnswerGrounding(answer: string, toolResults: unknown[]): GroundingResult {
  const stated = parseMoneyTokens(answer);
  const allowed = collectAllowedAmounts(toolResults);

  const unsupported = stated.filter((figure) => !isSupported(figure, allowed));

  return {
    grounded: unsupported.length === 0,
    unsupportedFigures: unsupported,
    statedFigures: stated,
  };
}

function parseMoneyTokens(text: string): number[] {
  const out: number[] = [];
  for (const token of text.match(MONEY_TOKEN_RE) ?? []) {
    const value = Number(token.replace(/[$,\s]/g, ""));
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

/**
 * Walk the tool results and collect every finite number — both numeric fields
 * and numbers embedded in strings (e.g. an ISO date or a "$1,200.00" inside a
 * label). The assistant is allowed to restate any of these.
 */
function collectAllowedAmounts(toolResults: unknown[]): Set<number> {
  const allowed = new Set<number>();

  const visit = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === "number") {
      if (Number.isFinite(node)) allowed.add(node);
      return;
    }
    if (typeof node === "string") {
      for (const m of node.match(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g) ?? []) {
        const value = Number(m.replace(/,/g, ""));
        if (Number.isFinite(value)) allowed.add(value);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) visit(value);
    }
  };

  for (const result of toolResults) visit(result);
  return allowed;
}

/**
 * A stated figure is supported if it equals an allowed value exactly, or rounds
 * to the same whole dollar (the model legitimately formats "$1,234.56" as
 * "$1,235" or "$1,200.00" as "$1,200"). The dollar-rounding tolerance is the
 * only fuzziness — anything looser would let a wrong amount slip through.
 */
function isSupported(figure: number, allowed: Set<number>): boolean {
  if (allowed.has(figure)) return true;
  const roundedFigure = Math.round(figure);
  for (const value of allowed) {
    if (Math.round(value) === roundedFigure) return true;
  }
  return false;
}

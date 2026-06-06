/**
 * Golden corpus for receipt-OCR output parsing (`normalizeOCRPayload`).
 *
 * These pin how the parser handles the *shapes models actually emit* — clean
 * JSON, markdown-fenced JSON, JSON wrapped in prose, truncated/garbage output,
 * and wrong-typed fields — independent of which provider produced them. A swap
 * to a new model that changes its formatting habits, or an edit to the parser,
 * will move these scores.
 */

import type { EvalCase } from "../types";
import type { OcrEvalExpected, OcrEvalInput } from "../graders";

export const ocrCases: ReadonlyArray<EvalCase<OcrEvalInput, OcrEvalExpected>> = [
  {
    id: "clean-json",
    description: "Well-formed JSON, all fields present.",
    input: {
      raw: JSON.stringify({
        vendor: "Acme Corp",
        amount: 42.99,
        tax: 3.44,
        currency: "USD",
        date: "2026-03-15",
        category: "Software",
        confidence: 0.95,
        lineItems: [{ description: "Pro Plan", quantity: 1, unitPrice: 42.99, total: 42.99 }],
      }),
    },
    expected: {
      vendor: "Acme Corp",
      amount: 42.99,
      tax: 3.44,
      currency: "USD",
      date: "2026-03-15",
      category: "Software",
      lineItemCount: 1,
      minConfidence: 0.9,
    },
  },
  {
    id: "markdown-fenced",
    description: "Model wrapped the JSON in a ```json code fence.",
    input: {
      raw: "```json\n" +
        JSON.stringify({
          vendor: "Office Depot",
          amount: 128.5,
          tax: 10.5,
          currency: "USD",
          date: "2026-01-09",
          category: "Office Supplies",
          confidence: 0.88,
          lineItems: [
            { description: "Paper", quantity: 2, unitPrice: 9.0, total: 18.0 },
            { description: "Toner", quantity: 1, unitPrice: 110.5, total: 110.5 },
          ],
        }) +
        "\n```",
    },
    expected: {
      vendor: "Office Depot",
      amount: 128.5,
      currency: "USD",
      category: "Office Supplies",
      lineItemCount: 2,
    },
  },
  {
    id: "prose-wrapped",
    description: "JSON embedded in chatty prose around it.",
    input: {
      raw:
        "Sure! Here is the extracted receipt data:\n" +
        JSON.stringify({
          vendor: "Blue Bottle Coffee",
          amount: 14.25,
          tax: 1.13,
          currency: "USD",
          date: "2026-05-02",
          category: "Meals",
          confidence: 0.8,
          lineItems: [],
        }) +
        "\nLet me know if you need anything else.",
    },
    expected: {
      vendor: "Blue Bottle Coffee",
      amount: 14.25,
      currency: "USD",
      category: "Meals",
      lineItemCount: 0,
    },
  },
  {
    id: "multi-currency-eur",
    description: "Non-USD receipt; currency code must round-trip.",
    input: {
      raw: JSON.stringify({
        vendor: "Hetzner Online GmbH",
        amount: 1234.56,
        tax: 197.0,
        currency: "EUR",
        date: "2026-02-28",
        category: "Utilities",
        confidence: 0.91,
        lineItems: [{ description: "Dedicated server", quantity: 1, unitPrice: 1037.56, total: 1037.56 }],
      }),
    },
    expected: {
      vendor: "Hetzner Online GmbH",
      amount: 1234.56,
      currency: "EUR",
      tax: 197.0,
      lineItemCount: 1,
    },
  },
  {
    id: "truncated-json-degrades-safely",
    description: "Output truncated mid-object — must degrade to nulls, never throw.",
    critical: true,
    input: {
      raw: '{"vendor":"Big Receipt Inc","amount":4999.00,"currency":"USD","lineItems":[{"description":"Item 1","quantity":1,"unitPrice":49',
    },
    // Unparseable → every field null, confidence 0. This is the safety contract:
    // a half-streamed response must not silently surface a partial amount.
    expected: {
      vendor: null,
      amount: null,
      currency: null,
      lineItemCount: 0,
    },
  },
  {
    id: "garbage-non-json",
    description: "Model refused / returned plain text — must not throw.",
    critical: true,
    input: { raw: "I'm sorry, I can't read this image clearly enough to extract data." },
    expected: { vendor: null, amount: null, lineItemCount: 0 },
  },
  {
    id: "string-typed-amount-is-dropped",
    description:
      "Documents current contract: a string-typed amount is treated as null (only real numbers are trusted).",
    input: {
      raw: JSON.stringify({
        vendor: "Stringly Typed LLC",
        amount: "42.99",
        currency: "USD",
        confidence: 0.7,
        lineItems: [],
      }),
    },
    expected: { vendor: "Stringly Typed LLC", amount: null, currency: "USD" },
  },
  {
    id: "missing-optional-fields",
    description: "Sparse receipt — only confidence present; everything else null.",
    input: { raw: JSON.stringify({ confidence: 0.2 }) },
    expected: {
      vendor: null,
      amount: null,
      tax: null,
      currency: null,
      date: null,
      category: null,
      lineItemCount: 0,
    },
  },
  {
    id: "non-iso-date-passes-through",
    description: "Documents that the parser does not normalize date format (string passthrough).",
    input: {
      raw: JSON.stringify({
        vendor: "Legacy POS",
        amount: 60,
        currency: "USD",
        date: "03/15/2026",
        confidence: 0.6,
        lineItems: [],
      }),
    },
    expected: { vendor: "Legacy POS", amount: 60, date: "03/15/2026" },
  },
];

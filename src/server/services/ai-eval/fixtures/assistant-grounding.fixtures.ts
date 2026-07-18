/**
 * Golden corpus for the books-assistant answer-grounding check
 * (`checkAnswerGrounding`).
 *
 * Each case pairs a natural-language answer with the tool results the assistant
 * was given, and asserts whether every dollar figure in the answer traces back
 * to the data. The `toolResults` shapes mirror the real tool outputs in
 * `books-assistant.ts` (accounts-receivable, overdue invoices, revenue summary).
 * Fabricated-figure cases are `critical`: those are the "never invent figures"
 * failures the system prompt promises to avoid.
 */

import type { EvalCase } from "../types";
import type { GroundingExpected, GroundingInput } from "../graders";

// Mirrors getAccountsReceivable(): two clients owing money.
const AR_RESULT = {
  totalOutstanding: 4200,
  clientCount: 2,
  clients: [
    { clientName: "Acme Corp", outstanding: 3000, openInvoices: 2, oldestDueDate: "2026-05-01" },
    { clientName: "Globex", outstanding: 1200, openInvoices: 1, oldestDueDate: "2026-06-10" },
  ],
};

// Mirrors getOverdueInvoices(): no dollar figures the answer below restates.
const OVERDUE_RESULT = {
  count: 3,
  totalOverdue: 4200,
  invoices: [
    { number: "INV-1001", clientName: "Acme Corp", balance: 3000, daysOverdue: 21, dueDate: "2026-05-01" },
  ],
};

// Mirrors getRevenueSummary() with a fractional collected figure for rounding.
const REVENUE_RESULT = {
  period: "last quarter",
  collected: 1234.56,
  paymentCount: 9,
  topClients: [{ clientName: "Acme Corp", collected: 1234.56 }],
};

const PAYMENT_HISTORY_RESULT = {
  period: "last quarter",
  payments: [{ client: "Acme Corp", invoiceNumber: "INV-201", amount: 800, daysLate: 10, paidLate: true }],
  summary: { count: 2, totalCollected: 1200, lateCount: 1, averageDaysLate: 10 },
};

const EXPENSE_SUMMARY_RESULT = {
  period: "this year",
  totalSpent: 3500,
  byCategory: [{ category: "Software", total: 2400, count: 8 }],
  topSuppliers: [{ supplier: "Figma", total: 1200 }],
};

const INVOICE_STATS_RESULT = {
  period: "last month",
  count: 4,
  totalBilled: 6400,
  averageValue: 1600,
  byStatus: { SENT: 3, DRAFT: 1 },
  largest: [{ number: "INV-301", client: "Globex", total: 3000, status: "SENT" }],
};

export const groundingCases: ReadonlyArray<EvalCase<GroundingInput, GroundingExpected>> = [
  // ── Grounded (every figure traces to the data) ─────────────────────────────
  {
    id: "ar-totals-restated",
    description: "Restates the total and both per-client balances exactly.",
    input: {
      answer:
        "Two clients owe you a total of $4,200.00 — Acme Corp at $3,000 and Globex at $1,200.",
      toolResults: [AR_RESULT],
    },
    expected: { grounded: true },
  },
  {
    id: "exact-cents-formatting",
    description: "Integer data formatted with cents in the answer.",
    input: {
      answer: "Globex still owes $1,200.00 on one open invoice.",
      toolResults: [AR_RESULT],
    },
    expected: { grounded: true },
  },
  {
    id: "dollar-rounding-allowed",
    description: "Model rounds $1,234.56 to the nearest dollar — a legitimate formatting choice.",
    input: {
      answer: "You collected about $1,235 last quarter across 9 payments.",
      toolResults: [REVENUE_RESULT],
    },
    expected: { grounded: true },
  },
  {
    id: "no-dollar-figures",
    description: "Answer states only counts/days, no dollar amounts to ground.",
    input: {
      answer: "You have 3 overdue invoices; the oldest is 21 days past due.",
      toolResults: [OVERDUE_RESULT],
    },
    expected: { grounded: true },
  },
  {
    id: "payment-history-grounded",
    description: "Restates collected payment history and lateness figures from the report tool.",
    input: {
      answer: "You collected $1,200 last quarter. Acme Corp paid INV-201 10 days late for $800.",
      toolResults: [PAYMENT_HISTORY_RESULT],
    },
    expected: { grounded: true },
  },
  {
    id: "expense-summary-grounded",
    description: "Restates the total spend and a category amount from the expense tool.",
    input: {
      answer: "You spent $3,500 this year, including $2,400 on Software.",
      toolResults: [EXPENSE_SUMMARY_RESULT],
    },
    expected: { grounded: true },
  },
  {
    id: "invoice-stats-grounded",
    description: "Restates billed and largest-invoice amounts from the invoice stats tool.",
    input: {
      answer: "You billed $6,400 last month; your largest invoice was $3,000 to Globex.",
      toolResults: [INVOICE_STATS_RESULT],
    },
    expected: { grounded: true },
  },

  // ── Ungrounded (a fabricated dollar figure) ────────────────────────────────
  {
    id: "fabricated-total",
    description: "Invents a total that doesn't appear anywhere in the data.",
    critical: true,
    input: {
      answer: "All told, you're owed roughly $9,999.00 across your clients.",
      toolResults: [AR_RESULT],
    },
    expected: { grounded: false },
  },
  {
    id: "one-real-one-fabricated",
    description: "Mixes a supported figure with a fabricated per-client amount.",
    critical: true,
    input: {
      answer: "Acme Corp owes $3,000 and Globex owes $7,500.",
      toolResults: [AR_RESULT],
    },
    expected: { grounded: false },
  },
  {
    id: "inflated-revenue",
    description: "Overstates collected revenue by an order of magnitude.",
    critical: true,
    input: {
      answer: "Revenue last quarter came in around $50,000.",
      toolResults: [REVENUE_RESULT],
    },
    expected: { grounded: false },
  },
  {
    id: "payment-history-fabricated-total",
    description: "Invents an unsupported collection amount from payment history.",
    critical: true,
    input: {
      answer: "You collected $9,000 last quarter.",
      toolResults: [PAYMENT_HISTORY_RESULT],
    },
    expected: { grounded: false },
  },
  {
    id: "expense-summary-fabricated-total",
    description: "Invents an unsupported expense amount.",
    critical: true,
    input: {
      answer: "Software spending was $8,000 this year.",
      toolResults: [EXPENSE_SUMMARY_RESULT],
    },
    expected: { grounded: false },
  },
  {
    id: "invoice-stats-fabricated-total",
    description: "Invents an unsupported billed amount.",
    critical: true,
    input: {
      answer: "You billed $12,000 last month.",
      toolResults: [INVOICE_STATS_RESULT],
    },
    expected: { grounded: false },
  },
];

/**
 * Golden corpus for the reminder fact-guard (`containsHallucinatedInvoiceFacts`).
 *
 * The guard is the last line of defense before an AI-drafted reminder reaches a
 * client: it rejects any draft that states an invoice number, amount, due date,
 * or payment URL that doesn't match the real invoice (falling back to the safe
 * template). False negatives are dangerous — a wrong amount or a swapped payment
 * URL would actually be sent — so those cases are marked `critical`. False
 * positives only downgrade to the template, so they're graded but not critical.
 */

import type { EvalCase } from "../types";
import type { ReminderGuardExpected, ReminderGuardInput } from "../graders";
import type { ReminderInvoiceFacts } from "../../smart-reminder-drafts";

const INVOICE: ReminderInvoiceFacts = {
  invoiceNumber: "INV-1001",
  amountDue: "1250.00",
  currencyCode: "USD",
  dueDate: "2026-06-15",
  daysOverdue: 7,
  paymentUrl: "https://app.example.com/pay/abc123",
};

const NO_URL_INVOICE: ReminderInvoiceFacts = { ...INVOICE, paymentUrl: undefined };

function safe(
  id: string,
  description: string,
  draft: ReminderGuardInput["draft"],
  invoice = INVOICE,
): EvalCase<ReminderGuardInput, ReminderGuardExpected> {
  return { id, description, input: { draft, invoice }, expected: { shouldFlag: false } };
}

function unsafe(
  id: string,
  description: string,
  draft: ReminderGuardInput["draft"],
  invoice = INVOICE,
  critical = true,
): EvalCase<ReminderGuardInput, ReminderGuardExpected> {
  return { id, description, critical, input: { draft, invoice }, expected: { shouldFlag: true } };
}

export const reminderGuardCases: ReadonlyArray<
  EvalCase<ReminderGuardInput, ReminderGuardExpected>
> = [
  // ── Must NOT flag (legitimate drafts) ──────────────────────────────────────
  safe("exact-restatement", "All facts restated exactly.", {
    subject: "Reminder: invoice INV-1001",
    body: "Invoice INV-1001 for 1250.00 USD is due 2026-06-15. Pay here: https://app.example.com/pay/abc123",
  }),
  safe("reformatted-date-in-prose", "Due date reformatted to human prose; everything else exact.", {
    subject: "A quick reminder about INV-1001",
    body: "Invoice INV-1001 for 1250.00 USD is due June 15, 2026. You can pay at https://app.example.com/pay/abc123.",
  }),
  safe("amount-without-decimals", "Amount written without cents — not a 2-decimal token, so not a mismatch.", {
    subject: "Reminder for INV-1001",
    body: "Your balance of 1,250 USD on invoice INV-1001 is due soon. Pay: https://app.example.com/pay/abc123",
  }),
  safe("overdue-count-mentioned", "Bare integer day count must not be mistaken for a hallucinated figure.", {
    subject: "INV-1001 is 7 days overdue",
    body: "Invoice INV-1001 for 1250.00 USD was due 2026-06-15 — now 7 days overdue. Pay: https://app.example.com/pay/abc123",
  }),
  safe("url-omitted", "Draft simply doesn't include the payment URL (absence is fine).", {
    subject: "Friendly reminder: INV-1001",
    body: "Just a note that invoice INV-1001 for 1250.00 USD was due 2026-06-15. Please reach out with any questions.",
  }),
  safe("trailing-punctuation-on-url", "Correct URL followed by a sentence period.", {
    subject: "Reminder: INV-1001",
    body: "Invoice INV-1001 for 1250.00 USD is due 2026-06-15. Pay at https://app.example.com/pay/abc123.",
  }),

  // ── MUST flag (hallucinated / swapped facts) ───────────────────────────────
  unsafe("wrong-invoice-number", "Cites a different invoice number.", {
    subject: "Reminder for invoice INV-9999",
    body: "Please pay invoice INV-9999 for 1250.00 USD by 2026-06-15. https://app.example.com/pay/abc123",
  }),
  unsafe("wrong-amount", "States a different amount.", {
    subject: "Reminder: invoice INV-1001",
    body: "Invoice INV-1001 for 9999.00 USD is due 2026-06-15. Pay: https://app.example.com/pay/abc123",
  }),
  unsafe("wrong-due-date", "Number and amount correct, due date wrong.", {
    subject: "Reminder: invoice INV-1001",
    body: "Invoice INV-1001 for 1250.00 USD is due 2026-12-31. Pay: https://app.example.com/pay/abc123",
  }),
  unsafe("swapped-payment-url", "Payment URL points at a different host — the dangerous redirect case.", {
    subject: "Reminder: invoice INV-1001",
    body: "Invoice INV-1001 for 1250.00 USD is due 2026-06-15. Pay at https://secure-billing.example.net/collect/abc123.",
  }),
  unsafe(
    "invented-url-when-none-provided",
    "No payment URL exists for this invoice, yet the draft invents one.",
    {
      subject: "Reminder: invoice INV-1001",
      body: "Invoice INV-1001 for 1250.00 USD is due 2026-06-15. Pay at https://app.example.com/pay/made-up.",
    },
    NO_URL_INVOICE,
  ),
  unsafe("amount-equals-overdue-count", "Wrong amount (7.00) that coincides with the overdue day count.", {
    subject: "Reminder: invoice INV-1001",
    body: "Invoice INV-1001 for 7.00 USD is due 2026-06-15. Pay: https://app.example.com/pay/abc123",
  }),
];

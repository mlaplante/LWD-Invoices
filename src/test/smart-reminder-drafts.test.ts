import { describe, expect, it } from "vitest";
import {
  buildOpenAIReminderPrompt,
  generateSmartReminderDraft,
  selectReminderTone,
} from "@/server/services/smart-reminder-drafts";

const baseInput = {
  invoice: {
    invoiceNumber: "INV-1001",
    amountDue: "1250.00",
    currencyCode: "USD",
    dueDate: "2026-06-15",
    daysOverdue: 0,
    paymentUrl: "https://app.example.com/pay/token",
  },
  template: {
    subject: "Reminder: invoice {{invoiceNumber}}",
    body: "Invoice {{invoiceNumber}} for {{amountDue}} is due {{dueDate}}. Pay here: {{paymentUrl}}",
  },
  organization: { name: "Laplante Web Development" },
};

describe("selectReminderTone", () => {
  it("uses a soft helpful tone for reliable payers", () => {
    expect(selectReminderTone({ paidInvoiceCount: 6, onTimePercent: 95, lateInvoiceCount: 0 }, 90, 0)).toBe("helpful");
  });

  it("uses a firm escalating tone for chronic late payers", () => {
    expect(selectReminderTone({ paidInvoiceCount: 8, onTimePercent: 25, lateInvoiceCount: 6 }, 90, 21)).toBe("firm");
  });
});

describe("buildOpenAIReminderPrompt", () => {
  it("minimizes sensitive data and pins deterministic invoice facts", () => {
    const prompt = buildOpenAIReminderPrompt({
      ...baseInput,
      paymentProfile: { paidInvoiceCount: 5, onTimePercent: 100, lateInvoiceCount: 0 },
      tone: "helpful",
    });

    expect(prompt).toContain("INV-1001");
    expect(prompt).toContain("1250.00 USD");
    expect(prompt).toContain("Do not add, infer, or change invoice facts");
    expect(prompt).not.toContain("client@example.com");
    expect(prompt).not.toContain("Acme Incorporated");
  });
});

describe("generateSmartReminderDraft", () => {
  it("returns an AI draft in review state for reliable-payer context", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      paymentProfile: { paidInvoiceCount: 7, onTimePercent: 100, lateInvoiceCount: 0 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({
        subject: "A quick reminder about invoice INV-1001",
        body: "Hi there — this may just be an oversight. Invoice INV-1001 for 1250.00 USD is due 2026-06-15. You can pay at https://app.example.com/pay/token.",
      }),
    });

    expect(draft.source).toBe("ai");
    expect(draft.tone).toBe("helpful");
    expect(draft.reviewRequired).toBe(true);
    expect(draft.body).toContain("oversight");
  });

  it("returns an AI draft in review state for chronic-late context", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      invoice: { ...baseInput.invoice, daysOverdue: 21 },
      paymentProfile: { paidInvoiceCount: 10, onTimePercent: 30, lateInvoiceCount: 7 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({
        subject: "Action needed: overdue invoice INV-1001",
        body: "Invoice INV-1001 for 1250.00 USD is now 21 days overdue. Please arrange payment today at https://app.example.com/pay/token or contact us if there is an issue.",
      }),
    });

    expect(draft.source).toBe("ai");
    expect(draft.tone).toBe("firm");
    expect(draft.reviewRequired).toBe(true);
    expect(draft.body).toContain("21 days overdue");
  });

  it("falls back to the deterministic template when OpenAI config is missing", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      paymentProfile: { paidInvoiceCount: 5, onTimePercent: 80, lateInvoiceCount: 1 },
      // The global test setup sets OPENAI_API_KEY, so force the no-key path with
      // an explicit empty key rather than relying on the env var being absent.
      openAI: { apiKey: "" },
    });

    expect(draft.source).toBe("template_fallback");
    expect(draft.fallbackReason).toBe("missing_openai_config");
    expect(draft.reviewRequired).toBe(true);
    expect(draft.body).toContain("Invoice INV-1001 for 1250.00 USD");
    expect(draft.body).toContain("https://app.example.com/pay/token");
    expect(draft.body).not.toContain("{{paymentUrl}}");
  });

  it("falls back when payment history is insufficient", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      paymentProfile: { paidInvoiceCount: 1, onTimePercent: null, lateInvoiceCount: 0 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({ subject: "ignored", body: "ignored" }),
    });

    expect(draft.source).toBe("template_fallback");
    expect(draft.fallbackReason).toBe("insufficient_payment_history");
  });

  it("rejects AI drafts that hallucinate invoice facts", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      paymentProfile: { paidInvoiceCount: 5, onTimePercent: 100, lateInvoiceCount: 0 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({
        subject: "Reminder for invoice INV-9999",
        body: "Please pay invoice INV-9999 for 9999.00 USD by 2026-07-01.",
      }),
    });

    expect(draft.source).toBe("template_fallback");
    expect(draft.fallbackReason).toBe("ai_fact_mismatch");
    expect(draft.body).toContain("INV-1001");
    expect(draft.body).not.toContain("INV-9999");
  });

  it("rejects AI drafts with a wrong due date even when number and amount are correct", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      paymentProfile: { paidInvoiceCount: 5, onTimePercent: 100, lateInvoiceCount: 0 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({
        subject: "Reminder: invoice INV-1001",
        body: "Invoice INV-1001 for 1250.00 USD is due 2026-12-31. Pay at https://app.example.com/pay/token.",
      }),
    });

    expect(draft.source).toBe("template_fallback");
    expect(draft.fallbackReason).toBe("ai_fact_mismatch");
    expect(draft.body).toContain("2026-06-15");
    expect(draft.body).not.toContain("2026-12-31");
  });

  it("rejects AI drafts that swap in a different payment URL", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      paymentProfile: { paidInvoiceCount: 5, onTimePercent: 100, lateInvoiceCount: 0 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({
        subject: "Reminder: invoice INV-1001",
        body: "Invoice INV-1001 for 1250.00 USD is due 2026-06-15. Pay at https://secure-billing.example.net/collect/token.",
      }),
    });

    expect(draft.source).toBe("template_fallback");
    expect(draft.fallbackReason).toBe("ai_fact_mismatch");
    expect(draft.body).toContain("https://app.example.com/pay/token");
    expect(draft.body).not.toContain("secure-billing.example.net");
  });

  it("rejects AI drafts that invent a payment URL when none was provided", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      invoice: { ...baseInput.invoice, paymentUrl: undefined },
      paymentProfile: { paidInvoiceCount: 5, onTimePercent: 100, lateInvoiceCount: 0 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({
        subject: "Reminder: invoice INV-1001",
        body: "Invoice INV-1001 for 1250.00 USD is due 2026-06-15. Pay at https://app.example.com/pay/anything.",
      }),
    });

    expect(draft.source).toBe("template_fallback");
    expect(draft.fallbackReason).toBe("ai_fact_mismatch");
  });

  it("rejects a wrong amount even when it equals the overdue day count", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      invoice: { ...baseInput.invoice, daysOverdue: 21 },
      paymentProfile: { paidInvoiceCount: 5, onTimePercent: 100, lateInvoiceCount: 0 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({
        subject: "Reminder: invoice INV-1001",
        body: "Invoice INV-1001 for 21.00 USD is due 2026-06-15. Pay at https://app.example.com/pay/token.",
      }),
    });

    expect(draft.source).toBe("template_fallback");
    expect(draft.fallbackReason).toBe("ai_fact_mismatch");
    expect(draft.body).toContain("1250.00 USD");
  });

  it("accepts AI drafts that keep the URL but reformat the due date in prose", async () => {
    const draft = await generateSmartReminderDraft({
      ...baseInput,
      paymentProfile: { paidInvoiceCount: 5, onTimePercent: 100, lateInvoiceCount: 0 },
      openAI: { apiKey: "test-key", model: "gpt-4o-mini" },
      callOpenAI: async () => ({
        subject: "A quick reminder about invoice INV-1001",
        body: "Invoice INV-1001 for 1250.00 USD is due June 15, 2026. Pay at https://app.example.com/pay/token.",
      }),
    });

    expect(draft.source).toBe("ai");
    expect(draft.body).toContain("June 15, 2026");
  });
});

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().email().default("invoices@example.com"),
    // Optional: when set, /api/webhooks/resend verifies incoming
    // Resend events (email.delivered/opened/clicked/...) and stores them
    // in the EmailEvent table. Get the secret from the Resend dashboard
    // when adding a webhook endpoint.
    RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
    // Inbound email threading. When RESEND_INBOUND_DOMAIN is set, invoice
    // emails get a Reply-To of reply+<invoiceId>@<domain> so client replies
    // route to the inbound webhook and thread onto the invoice/ticket.
    // RESEND_INBOUND_WEBHOOK_SECRET verifies the inbound webhook (Svix).
    RESEND_INBOUND_DOMAIN: z.string().min(1).optional(),
    RESEND_INBOUND_WEBHOOK_SECRET: z.string().min(1).optional(),
    GATEWAY_ENCRYPTION_KEY: z
      .string()
      .length(64)
      .optional()
      .refine(
        (val) =>
          process.env.NODE_ENV !== "production" ||
          !!val ||
          !!process.env.GATEWAY_ENCRYPTION_KEYS,
        "GATEWAY_ENCRYPTION_KEY (or GATEWAY_ENCRYPTION_KEYS) is required in production",
      ),
    // Ordered keyring for key rotation: "<keyId>:<64-char hex>,...". The
    // first entry encrypts new values; every entry can decrypt. See
    // src/server/services/encryption.ts for the rotation procedure.
    GATEWAY_ENCRYPTION_KEYS: z
      .string()
      .regex(
        /^\s*[^:,\s]+:[0-9a-fA-F]{64}\s*(,\s*[^:,\s]+:[0-9a-fA-F]{64}\s*)*$/,
        'GATEWAY_ENCRYPTION_KEYS must be "<keyId>:<64-char hex>" entries, comma-separated',
      )
      .optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // Required in production: without it the Inngest SDK accepts unsigned
    // requests, letting anyone who finds /api/inngest trigger scheduled jobs.
    INNGEST_SIGNING_KEY: z
      .string()
      .min(1)
      .optional()
      .refine(
        (val) => process.env.NODE_ENV !== "production" || !!val,
        "INNGEST_SIGNING_KEY is required in production",
      ),
    INNGEST_EVENT_KEY: z.string().min(1).optional(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    // Model used by the "Ask your books" assistant on the Anthropic fallback
    // path. Defaults to claude-opus-4-8; override for a cheaper/faster model.
    ANTHROPIC_AGENT_MODEL: z.string().min(1).optional(),
    // Which provider powers the books assistant. Defaults to Gemini first (its
    // function-calling + model-fallback chain) when GEMINI_API_KEY is set,
    // otherwise Anthropic. Set explicitly to pin a provider.
    ASSISTANT_AI_PROVIDER: z.enum(["gemini", "anthropic"]).optional(),
    // Ordered Gemini model fallback chain for the assistant (429 → next model).
    // Leave unset for the built-in default chain.
    GEMINI_AGENT_MODELS: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    OPENAI_REMINDER_MODEL: z.string().min(1).optional(),
    // Comma-separated, ordered Gemini model fallback chain for reminder drafting
    // (same 429 fallback behavior as GEMINI_OCR_MODELS). Leave unset for the
    // built-in default chain.
    GEMINI_REMINDER_MODELS: z.string().min(1).optional(),
    REMINDER_AI_PROVIDER: z.enum(["openai", "gemini"]).optional(),
    // Comma-separated, ordered Gemini model fallback chain for the cash-flow
    // narrative (same 429 fallback behavior as GEMINI_OCR_MODELS). Leave unset
    // for the built-in default chain.
    GEMINI_CASHFLOW_MODELS: z.string().min(1).optional(),
    RECEIPT_OCR_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).optional(),
    // Comma-separated, ordered list of Gemini vision models to try for receipt
    // OCR. When one model returns a 429 (rate-limit/quota), the next is tried.
    // Leave unset to use the built-in default chain. Example:
    //   GEMINI_OCR_MODELS="gemini-2.0-flash,gemini-2.5-flash,gemini-1.5-flash"
    GEMINI_OCR_MODELS: z.string().min(1).optional(),
    // Which provider drafts invoices from natural-language prompts. Defaults to
    // Gemini (its model-fallback chain) when GEMINI_API_KEY is set, otherwise
    // OpenAI. Set explicitly to pin a provider.
    INVOICE_PARSER_PROVIDER: z.enum(["openai", "gemini"]).optional(),
    OPENAI_INVOICE_PARSER_MODEL: z.string().min(1).optional(),
    // Comma-separated, ordered Gemini model fallback chain for invoice drafting,
    // mirroring GEMINI_OCR_MODELS: on a 429 the next model is tried. Leave unset
    // for the built-in default chain.
    GEMINI_INVOICE_PARSER_MODELS: z.string().min(1).optional(),
    // Which provider powers the AI invoice reviewer's "unclear line description"
    // check. Defaults to Gemini (its 429 model-fallback chain) when GEMINI_API_KEY
    // is set, otherwise Anthropic/OpenAI. Set explicitly to pin a provider.
    INVOICE_REVIEW_AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).optional(),
    // Comma-separated, ordered Gemini model fallback chain for the invoice
    // reviewer (same 429 fallback behavior as GEMINI_OCR_MODELS). Leave unset for
    // the built-in default chain.
    GEMINI_INVOICE_REVIEW_MODELS: z.string().min(1).optional(),
    // Provider for the expense-categorization LLM fallback (new/ambiguous
    // suppliers only). Defaults to Gemini when GEMINI_API_KEY is set.
    EXPENSE_CATEGORY_AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).optional(),
    // Ordered Gemini model fallback chain for expense categorization.
    GEMINI_EXPENSE_CATEGORY_MODELS: z.string().min(1).optional(),
    // Provider for AI proposal generation. Defaults to Gemini when GEMINI_API_KEY is set.
    PROPOSAL_AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).optional(),
    // Ordered Gemini model fallback chain for proposal generation.
    GEMINI_PROPOSAL_MODELS: z.string().min(1).optional(),
    // Dedicated HMAC secret for signing public-portal session cookies.
    // Optional for back-compat: when unset, the portal-session helpers fall
    // back to SUPABASE_SERVICE_ROLE_KEY. Set this in production so the
    // service-role key isn't also a cookie-forgery key — rotating one
    // shouldn't invalidate every portal session, and vice versa.
    PORTAL_SESSION_SECRET: z.string().min(32).optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    RESEND_INBOUND_DOMAIN: process.env.RESEND_INBOUND_DOMAIN,
    RESEND_INBOUND_WEBHOOK_SECRET: process.env.RESEND_INBOUND_WEBHOOK_SECRET,
    GATEWAY_ENCRYPTION_KEY: process.env.GATEWAY_ENCRYPTION_KEY,
    GATEWAY_ENCRYPTION_KEYS: process.env.GATEWAY_ENCRYPTION_KEYS,
    NODE_ENV: process.env.NODE_ENV,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_AGENT_MODEL: process.env.ANTHROPIC_AGENT_MODEL,
    ASSISTANT_AI_PROVIDER: process.env.ASSISTANT_AI_PROVIDER,
    GEMINI_AGENT_MODELS: process.env.GEMINI_AGENT_MODELS,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_REMINDER_MODEL: process.env.OPENAI_REMINDER_MODEL,
    GEMINI_REMINDER_MODELS: process.env.GEMINI_REMINDER_MODELS,
    REMINDER_AI_PROVIDER: process.env.REMINDER_AI_PROVIDER,
    GEMINI_CASHFLOW_MODELS: process.env.GEMINI_CASHFLOW_MODELS,
    RECEIPT_OCR_PROVIDER: process.env.RECEIPT_OCR_PROVIDER,
    GEMINI_OCR_MODELS: process.env.GEMINI_OCR_MODELS,
    INVOICE_PARSER_PROVIDER: process.env.INVOICE_PARSER_PROVIDER,
    OPENAI_INVOICE_PARSER_MODEL: process.env.OPENAI_INVOICE_PARSER_MODEL,
    GEMINI_INVOICE_PARSER_MODELS: process.env.GEMINI_INVOICE_PARSER_MODELS,
    INVOICE_REVIEW_AI_PROVIDER: process.env.INVOICE_REVIEW_AI_PROVIDER,
    GEMINI_INVOICE_REVIEW_MODELS: process.env.GEMINI_INVOICE_REVIEW_MODELS,
    EXPENSE_CATEGORY_AI_PROVIDER: process.env.EXPENSE_CATEGORY_AI_PROVIDER,
    GEMINI_EXPENSE_CATEGORY_MODELS: process.env.GEMINI_EXPENSE_CATEGORY_MODELS,
    PROPOSAL_AI_PROVIDER: process.env.PROPOSAL_AI_PROVIDER,
    GEMINI_PROPOSAL_MODELS: process.env.GEMINI_PROPOSAL_MODELS,
    PORTAL_SESSION_SECRET: process.env.PORTAL_SESSION_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

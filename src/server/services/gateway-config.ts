export type StripeConfig = {
  secretKey: string;       // sk_live_... or sk_test_...
  publishableKey: string;  // pk_live_... or pk_test_...
  webhookSecret: string;   // whsec_...
  // Bank-debit payment methods on Checkout. Both are delayed-notification
  // methods: the invoice is only marked paid on async_payment_succeeded,
  // not at checkout completion. Currency-gated at session creation
  // (ACH = USD invoices, SEPA = EUR invoices).
  achDebitEnabled?: boolean;
  sepaDebitEnabled?: boolean;
};

export type PayPalConfig = {
  email: string;
};

export type ManualConfig = {
  instructions: string;
};

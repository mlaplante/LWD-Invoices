export type StripeConfig = {
  secretKey: string;       // sk_live_... or sk_test_...
  publishableKey: string;  // pk_live_... or pk_test_...
  webhookSecret: string;   // whsec_...
};

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  sandbox: boolean;
};

export type ManualConfig = {
  instructions: string;
};

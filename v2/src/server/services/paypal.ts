import type { Prisma } from "@/generated/prisma";
import type { PayPalConfig } from "./gateway-config";
type Decimal = Prisma.Decimal;

function getApiBase(sandbox: boolean): string {
  return sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

export async function getPayPalAccessToken(config: PayPalConfig): Promise<string> {
  const base = getApiBase(config.sandbox);
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function createPayPalOrder(opts: {
  config: PayPalConfig;
  invoice: {
    id: string;
    number: string;
    total: Decimal;
    currency: { code: string };
    portalToken: string;
    organizationId: string;
  };
  surcharge: number;
  appUrl: string;
}): Promise<{ orderId: string; approveUrl: string }> {
  const { config, invoice, surcharge, appUrl } = opts;

  const invoiceTotal = invoice.total.toNumber();
  const chargedAmount = invoiceTotal * (1 + surcharge / 100);
  const amountStr = chargedAmount.toFixed(2);

  const accessToken = await getPayPalAccessToken(config);
  const base = getApiBase(config.sandbox);

  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: invoice.id,
        custom_id: JSON.stringify({ invoiceId: invoice.id, orgId: invoice.organizationId }),
        description: `Invoice #${invoice.number}`,
        amount: {
          currency_code: invoice.currency.code.toUpperCase(),
          value: amountStr,
        },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          return_url: `${appUrl}/portal/${invoice.portalToken}/payment-success?order_id=`,
          cancel_url: `${appUrl}/portal/${invoice.portalToken}`,
        },
      },
    },
  };

  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `inv-${invoice.id}-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal order creation failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    id: string;
    links: { rel: string; href: string }[];
  };

  const approveLink = data.links.find((l) => l.rel === "payer-action");
  if (!approveLink) throw new Error("PayPal approve URL not found");

  return { orderId: data.id, approveUrl: approveLink.href };
}

export async function capturePayPalOrder(
  config: PayPalConfig,
  orderId: string
): Promise<{ transactionId: string; amount: string }> {
  const accessToken = await getPayPalAccessToken(config);
  const base = getApiBase(config.sandbox);

  const res = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal capture failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    purchase_units: {
      payments: {
        captures: { id: string; amount: { value: string } }[];
      };
    }[];
  };

  const capture = data.purchase_units[0]?.payments.captures[0];
  if (!capture) throw new Error("No capture found in PayPal response");

  return { transactionId: capture.id, amount: capture.amount.value };
}

export async function verifyPayPalWebhook(
  config: PayPalConfig,
  headers: Record<string, string>,
  body: string
): Promise<boolean> {
  const accessToken = await getPayPalAccessToken(config);
  const base = getApiBase(config.sandbox);

  const verifyBody = {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: config.webhookId,
    webhook_event: JSON.parse(body) as unknown,
  };

  const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(verifyBody),
  });

  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status: string };
  return data.verification_status === "SUCCESS";
}

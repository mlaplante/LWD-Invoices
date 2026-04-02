import crypto from "crypto";

/**
 * Creates a mock NextRequest for testing API routes
 */
export function createMockNextRequest(
  method: string,
  url: string,
  options?: {
    headers?: Record<string, string>;
    body?: string | object;
  }
): Request {
  const headers = new Headers(options?.headers ?? {});

  let body: BodyInit | null = null;
  if (options?.body) {
    if (typeof options.body === "string") {
      body = options.body;
    } else {
      body = JSON.stringify(options.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  return new Request(url, {
    method,
    headers,
    body,
  });
}

/**
 * Creates a Bearer token authorization header
 */
export function createMockAuthHeader(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}

/**
 * Creates a Stripe signature header value
 * Format: t=<timestamp>,v1=<signature>
 */
export function createMockStripeSignature(
  payload: string,
  secret: string
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = `${timestamp}.${payload}`;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signed);
  const signature = hmac.digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

/**
 * Extracts pagination parameters from a NextRequest
 */
export function extractPaginationParams(req: Request): {
  page: number;
  perPage: number;
} {
  const url = new URL(req.url);
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "20", 10);

  return {
    page: isNaN(rawPage) || rawPage < 1 ? 1 : rawPage,
    perPage: isNaN(rawPerPage) || rawPerPage < 1 ? 20 : Math.min(rawPerPage, 100),
  };
}

/**
 * Extracts a query parameter value
 */
export function getQueryParam(req: Request, name: string): string | null {
  const url = new URL(req.url);
  return url.searchParams.get(name);
}

/**
 * Parses JSON response body
 */
export async function parseJsonResponse(
  response: Response
): Promise<Record<string, any>> {
  const text = await response.text();
  return JSON.parse(text);
}

/**
 * Creates a mock Stripe event payload
 */
export function createMockStripeCheckoutSession(overrides?: Record<string, any>) {
  return {
    id: "cs_test_123456",
    object: "checkout.session",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123456",
        amount_total: 10000,
        payment_intent: "pi_test_123456",
        metadata: {
          invoiceId: "inv_123456",
          orgId: "org_123456",
          ...overrides?.metadata,
        },
        ...overrides,
      },
    },
  };
}

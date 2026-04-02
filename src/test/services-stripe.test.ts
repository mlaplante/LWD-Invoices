import { describe, it, expect, beforeEach, vi } from "vitest";
import Stripe from "stripe";
import {
  getStripeClient,
  createCheckoutSession,
  constructStripeEvent,
} from "@/server/services/stripe";

// Mock the Stripe SDK
vi.mock("stripe", () => {
  const mockCheckoutSessions = {
    create: vi.fn(),
    retrieve: vi.fn(),
  };

  const mockWebhooks = {
    constructEvent: vi.fn(),
  };

  // Use a class-like constructor that can be instantiated with 'new'
  class MockStripe {
    checkout: any;
    static webhooks = mockWebhooks;

    constructor(apiKey: string, options?: any) {
      this.checkout = {
        sessions: mockCheckoutSessions,
      };
    }
  }

  return {
    default: MockStripe as any,
  };
});

describe("Stripe Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStripeClient", () => {
    it("creates a Stripe client with valid API key", () => {
      const client = getStripeClient("sk_test_12345");
      expect(client).toBeDefined();
      expect(client.checkout).toBeDefined();
      expect(client.checkout.sessions).toBeDefined();
    });

    it("creates client with test key", () => {
      const client = getStripeClient("sk_test_abcdef");
      expect(client).toBeDefined();
      expect(client.checkout.sessions).toBeDefined();
    });

    it("creates client with production key pattern", () => {
      const client = getStripeClient("sk_live_abcdef123456");
      expect(client).toBeDefined();
      expect(client.checkout.sessions).toBeDefined();
    });
  });

  describe("createCheckoutSession", () => {
    let mockStripeInstance: any;

    beforeEach(() => {
      mockStripeInstance = {
        checkout: {
          sessions: {
            create: vi.fn(),
          },
        },
      };
    });

    it("creates payment intent with valid parameters", async () => {
      const mockSession = {
        id: "cs_test_session_123",
        url: "https://checkout.stripe.com/pay/cs_test_session_123",
        object: "checkout.session",
      };

      mockStripeInstance.checkout.sessions.create.mockResolvedValue(mockSession);

      const invoice = {
        id: "inv_123",
        number: "2026-0001",
        total: { toNumber: () => 100 } as any,
        currency: { code: "USD" },
        portalToken: "portal_token_123",
        organizationId: "org_123",
      };

      const result = await createCheckoutSession({
        stripeClient: mockStripeInstance,
        invoice,
        surcharge: 0,
        appUrl: "https://app.example.com",
      });

      expect(result.url).toBe(mockSession.url);
      expect(result.sessionId).toBe(mockSession.id);
      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalled();
    });

    it("includes customer and invoice metadata", async () => {
      const mockSession = {
        id: "cs_test_123",
        url: "https://checkout.stripe.com/pay/cs_test_123",
      };

      mockStripeInstance.checkout.sessions.create.mockResolvedValue(mockSession);

      const invoice = {
        id: "inv_456",
        number: "2026-0002",
        total: { toNumber: () => 250 } as any,
        currency: { code: "EUR" },
        portalToken: "portal_token_456",
        organizationId: "org_456",
      };

      await createCheckoutSession({
        stripeClient: mockStripeInstance,
        invoice,
        surcharge: 0,
        appUrl: "https://app.example.com",
      });

      const callArgs = mockStripeInstance.checkout.sessions.create.mock
        .calls[0][0];
      expect(callArgs.metadata).toEqual({
        invoiceId: "inv_456",
        orgId: "org_456",
        portalToken: "portal_token_456",
      });
    });

    it("calculates amount correctly with surcharge", async () => {
      const mockSession = {
        id: "cs_test_456",
        url: "https://checkout.stripe.com/pay/cs_test_456",
      };

      mockStripeInstance.checkout.sessions.create.mockResolvedValue(mockSession);

      const invoice = {
        id: "inv_789",
        number: "2026-0003",
        total: { toNumber: () => 100 } as any,
        currency: { code: "USD" },
        portalToken: "portal_token_789",
        organizationId: "org_789",
      };

      await createCheckoutSession({
        stripeClient: mockStripeInstance,
        invoice,
        surcharge: 2.5, // 2.5% surcharge
        appUrl: "https://app.example.com",
      });

      const callArgs = mockStripeInstance.checkout.sessions.create.mock
        .calls[0][0];
      // 100 * (1 + 2.5/100) = 102.5, in cents = 10250
      expect(callArgs.line_items[0].price_data.unit_amount).toBe(10250);
    });

    it("throws error when session URL is missing", async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: "cs_test_789",
        url: null, // No URL
      });

      const invoice = {
        id: "inv_111",
        number: "2026-0004",
        total: { toNumber: () => 500 } as any,
        currency: { code: "USD" },
        portalToken: "portal_token_111",
        organizationId: "org_111",
      };

      await expect(
        createCheckoutSession({
          stripeClient: mockStripeInstance,
          invoice,
          surcharge: 0,
          appUrl: "https://app.example.com",
        })
      ).rejects.toThrow("Stripe session URL missing");
    });

    it("handles network errors when creating session", async () => {
      mockStripeInstance.checkout.sessions.create.mockRejectedValue(
        new Error("Network error: ECONNREFUSED")
      );

      const invoice = {
        id: "inv_222",
        number: "2026-0005",
        total: { toNumber: () => 150 } as any,
        currency: { code: "USD" },
        portalToken: "portal_token_222",
        organizationId: "org_222",
      };

      await expect(
        createCheckoutSession({
          stripeClient: mockStripeInstance,
          invoice,
          surcharge: 0,
          appUrl: "https://app.example.com",
        })
      ).rejects.toThrow("Network error");
    });

    it("includes correct product name in session", async () => {
      const mockSession = {
        id: "cs_test_product",
        url: "https://checkout.stripe.com/pay/cs_test_product",
      };

      mockStripeInstance.checkout.sessions.create.mockResolvedValue(mockSession);

      const invoice = {
        id: "inv_333",
        number: "2026-0099",
        total: { toNumber: () => 75 } as any,
        currency: { code: "GBP" },
        portalToken: "portal_token_333",
        organizationId: "org_333",
      };

      await createCheckoutSession({
        stripeClient: mockStripeInstance,
        invoice,
        surcharge: 0,
        appUrl: "https://app.example.com",
      });

      const callArgs = mockStripeInstance.checkout.sessions.create.mock
        .calls[0][0];
      expect(callArgs.line_items[0].price_data.product_data.name).toBe(
        "Invoice #2026-0099"
      );
    });

    it("sets correct currency in lowercase", async () => {
      const mockSession = {
        id: "cs_test_currency",
        url: "https://checkout.stripe.com/pay/cs_test_currency",
      };

      mockStripeInstance.checkout.sessions.create.mockResolvedValue(mockSession);

      const invoice = {
        id: "inv_444",
        number: "2026-0010",
        total: { toNumber: () => 200 } as any,
        currency: { code: "JPY" }, // Uppercase in database
        portalToken: "portal_token_444",
        organizationId: "org_444",
      };

      await createCheckoutSession({
        stripeClient: mockStripeInstance,
        invoice,
        surcharge: 0,
        appUrl: "https://app.example.com",
      });

      const callArgs = mockStripeInstance.checkout.sessions.create.mock
        .calls[0][0];
      expect(callArgs.line_items[0].price_data.currency).toBe("jpy");
    });
  });

  describe("constructStripeEvent", () => {
    beforeEach(() => {
      const StripeClass = vi.mocked(Stripe);
      StripeClass.webhooks = {
        constructEvent: vi.fn(),
      };
    });

    it("verifies webhook signature successfully", () => {
      const payload = JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_123" } },
      });
      const sig = "t=123456789,v1=signature123";
      const secret = "whsec_test123";

      const mockEvent = {
        type: "checkout.session.completed",
        data: { object: { id: "cs_123" } },
      } as any;

      const StripeClass = vi.mocked(Stripe);
      StripeClass.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = constructStripeEvent(payload, sig, secret);

      expect(result).toEqual(mockEvent);
      expect(StripeClass.webhooks.constructEvent).toHaveBeenCalledWith(
        payload,
        sig,
        secret
      );
    });

    it("rejects invalid webhook signature", () => {
      const payload = JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_456" } },
      });
      const sig = "t=123456789,v1=invalid_signature";
      const secret = "whsec_test456";

      const StripeClass = vi.mocked(Stripe);
      StripeClass.webhooks.constructEvent.mockImplementation(() => {
        throw new Error(
          "No matching valid signature found. Possible causes: (1) the webhook secret is incorrect, (2) the payload was modified, or (3) the signature is outside of the tolerance window."
        );
      });

      expect(() => {
        constructStripeEvent(payload, sig, secret);
      }).toThrow();

      expect(StripeClass.webhooks.constructEvent).toHaveBeenCalled();
    });

    it("handles different webhook event types", () => {
      const eventTypes = [
        "checkout.session.completed",
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "charge.refunded",
      ];

      const StripeClass = vi.mocked(Stripe);

      eventTypes.forEach((eventType) => {
        const payload = JSON.stringify({
          type: eventType,
          data: { object: { id: "test_id" } },
        });
        const sig = "t=123456789,v1=sig123";
        const secret = "whsec_test";

        const mockEvent = {
          type: eventType,
          data: { object: { id: "test_id" } },
        } as any;

        StripeClass.webhooks.constructEvent.mockReturnValue(mockEvent);

        const result = constructStripeEvent(payload, sig, secret);

        expect(result.type).toBe(eventType);
      });
    });

    it("preserves event metadata through verification", () => {
      const payload = JSON.stringify({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_789",
            metadata: {
              invoiceId: "inv_123",
              orgId: "org_456",
              portalToken: "token_789",
            },
          },
        },
      });
      const sig = "t=123456789,v1=sig789";
      const secret = "whsec_final";

      const mockEvent = {
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_789",
            metadata: {
              invoiceId: "inv_123",
              orgId: "org_456",
              portalToken: "token_789",
            },
          },
        },
      } as any;

      const StripeClass = vi.mocked(Stripe);
      StripeClass.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = constructStripeEvent(payload, sig, secret);

      expect(result.data.object.metadata).toEqual({
        invoiceId: "inv_123",
        orgId: "org_456",
        portalToken: "token_789",
      });
    });
  });
});

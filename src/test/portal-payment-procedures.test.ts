import { describe, it, expect, beforeEach, vi } from "vitest";
import { portalRouter } from "@/server/routers/portal";
import { createMockContext } from "./mocks/trpc-context";
import { GatewayType, InvoiceStatus } from "@/generated/prisma";
import { Decimal } from "@prisma/client-runtime-utils";
import * as encryptionService from "@/server/services/encryption";
import { createCheckoutSession, getStripeClient } from "@/server/services/stripe";

// Mock bcryptjs (required by portal router)
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}));

// Mock portal-dashboard helpers
vi.mock("@/server/services/portal-dashboard", () => ({
  generateSessionToken: vi.fn(() => "mock-session-token"),
  SESSION_DURATION_MS: 30 * 24 * 60 * 60 * 1000,
  isSessionExpired: vi.fn(),
}));

// Mock signature helpers
vi.mock("@/server/services/signature", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/signature")>(
    "@/server/services/signature"
  );
  return {
    ...actual,
    encryptSignature: vi.fn(() => "encrypted-signature-data"),
  };
});

// Mock encryption service
vi.mock("@/server/services/encryption", () => ({
  encryptJson: vi.fn(),
  decryptJson: vi.fn(),
}));

// Mock stripe service
vi.mock("@/server/services/stripe", () => ({
  getStripeClient: vi.fn(),
  createCheckoutSession: vi.fn(),
}));

// Mock notifications (dynamic import)
vi.mock("@/server/services/notifications", () => ({
  notifyOrgAdmins: vi.fn(),
}));

describe("Portal Payment Procedures", () => {
  let ctx: any;
  let caller: any;

  const mockCurrency = {
    id: "cur-1",
    code: "USD",
    symbol: "$",
    symbolPosition: "BEFORE",
  };

  const mockClient = {
    id: "client-1",
    name: "Test Client",
    email: "client@test.com",
  };

  const mockOrganization = {
    id: "org-1",
    name: "Test Org",
    logoUrl: null,
  };

  const makeInvoice = (overrides: Record<string, unknown> = {}) => ({
    id: "inv-1",
    number: "INV-001",
    status: InvoiceStatus.SENT,
    total: new Decimal("500.00"),
    portalToken: "test-portal-token",
    organizationId: "org-1",
    clientId: "client-1",
    client: mockClient,
    currency: mockCurrency,
    organization: mockOrganization,
    lines: [],
    payments: [],
    ...overrides,
  });

  const mockGateway = {
    id: "gw-1",
    organizationId: "org-1",
    gatewayType: GatewayType.STRIPE,
    isEnabled: true,
    configJson: "encrypted-config",
    surcharge: new Decimal("2.5"),
    label: "Pay with Stripe",
  };

  const mockStripeConfig = {
    secretKey: "sk_test_123",
    publishableKey: "pk_test_123",
  };

  beforeEach(() => {
    ctx = createMockContext();
    caller = portalRouter.createCaller(ctx);
    vi.clearAllMocks();

    // Default mock: decryptJson returns stripe config
    vi.mocked(encryptionService.decryptJson).mockReturnValue(mockStripeConfig);

    // Default mock: getStripeClient returns a fake stripe client
    vi.mocked(getStripeClient).mockReturnValue({} as any);

    // Default mock: createCheckoutSession returns a URL
    vi.mocked(createCheckoutSession).mockResolvedValue({
      url: "https://checkout.stripe.com/session/test",
      sessionId: "cs_test_123",
    });
  });

  describe("createStripeCheckout", () => {
    it("creates a checkout session for a payable invoice", async () => {
      const invoice = makeInvoice();
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);
      ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

      const result = await caller.createStripeCheckout({
        token: "test-portal-token",
      });

      expect(result.url).toBe("https://checkout.stripe.com/session/test");

      // Verify encryption was called with the gateway config
      expect(encryptionService.decryptJson).toHaveBeenCalledWith("encrypted-config");

      // Verify getStripeClient was called with the secret key
      expect(getStripeClient).toHaveBeenCalledWith("sk_test_123");

      // Verify createCheckoutSession was called with correct params
      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: expect.objectContaining({
            id: "inv-1",
            number: "INV-001",
            portalToken: "test-portal-token",
            organizationId: "org-1",
          }),
          surcharge: 2.5,
          amountOverride: undefined,
          partialPaymentId: undefined,
        })
      );
    });

    it("works for PARTIALLY_PAID status", async () => {
      const invoice = makeInvoice({ status: InvoiceStatus.PARTIALLY_PAID });
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);
      ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

      const result = await caller.createStripeCheckout({
        token: "test-portal-token",
      });

      expect(result.url).toBe("https://checkout.stripe.com/session/test");
    });

    it("works for OVERDUE status", async () => {
      const invoice = makeInvoice({ status: InvoiceStatus.OVERDUE });
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);
      ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

      const result = await caller.createStripeCheckout({
        token: "test-portal-token",
      });

      expect(result.url).toBe("https://checkout.stripe.com/session/test");
    });

    it("throws NOT_FOUND when invoice does not exist", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(
        caller.createStripeCheckout({ token: "nonexistent-token" })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("throws BAD_REQUEST for non-payable invoice (DRAFT)", async () => {
      const invoice = makeInvoice({ status: InvoiceStatus.DRAFT });
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);

      await expect(
        caller.createStripeCheckout({ token: "test-portal-token" })
      ).rejects.toThrow("Invoice is not payable");
    });

    it("throws BAD_REQUEST for non-payable invoice (PAID)", async () => {
      const invoice = makeInvoice({ status: InvoiceStatus.PAID });
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);

      await expect(
        caller.createStripeCheckout({ token: "test-portal-token" })
      ).rejects.toThrow("Invoice is not payable");
    });

    it("throws BAD_REQUEST for non-payable invoice (CANCELLED)", async () => {
      const invoice = makeInvoice({ status: InvoiceStatus.CANCELLED });
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);

      await expect(
        caller.createStripeCheckout({ token: "test-portal-token" })
      ).rejects.toThrow("Invoice is not payable");
    });

    it("throws BAD_REQUEST when Stripe gateway not found", async () => {
      const invoice = makeInvoice();
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);
      ctx.db.gatewaySetting.findUnique.mockResolvedValue(null);

      await expect(
        caller.createStripeCheckout({ token: "test-portal-token" })
      ).rejects.toThrow("Stripe is not enabled");
    });

    it("throws BAD_REQUEST when Stripe gateway is disabled", async () => {
      const invoice = makeInvoice();
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);
      ctx.db.gatewaySetting.findUnique.mockResolvedValue({
        ...mockGateway,
        isEnabled: false,
      });

      await expect(
        caller.createStripeCheckout({ token: "test-portal-token" })
      ).rejects.toThrow("Stripe is not enabled");
    });

    describe("partial payment", () => {
      it("creates checkout for a valid partial payment (fixed amount)", async () => {
        const invoice = makeInvoice({ status: InvoiceStatus.PARTIALLY_PAID });
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.partialPayment.findUnique.mockResolvedValue({
          id: "pp-1",
          invoiceId: "inv-1",
          isPaid: false,
          isPercentage: false,
          amount: new Decimal("150.00"),
        });
        ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

        const result = await caller.createStripeCheckout({
          token: "test-portal-token",
          partialPaymentId: "pp-1",
        });

        expect(result.url).toBe("https://checkout.stripe.com/session/test");
        expect(createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            amountOverride: 150,
            partialPaymentId: "pp-1",
          })
        );
      });

      it("creates checkout for a percentage-based partial payment", async () => {
        const invoice = makeInvoice({
          status: InvoiceStatus.SENT,
          total: new Decimal("1000.00"),
        });
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.partialPayment.findUnique.mockResolvedValue({
          id: "pp-2",
          invoiceId: "inv-1",
          isPaid: false,
          isPercentage: true,
          amount: new Decimal("25"), // 25%
        });
        ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

        const result = await caller.createStripeCheckout({
          token: "test-portal-token",
          partialPaymentId: "pp-2",
        });

        expect(result.url).toBe("https://checkout.stripe.com/session/test");
        expect(createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            amountOverride: 250, // 25% of 1000
            partialPaymentId: "pp-2",
          })
        );
      });

      it("throws BAD_REQUEST for partial payment from different invoice", async () => {
        const invoice = makeInvoice();
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.partialPayment.findUnique.mockResolvedValue({
          id: "pp-other",
          invoiceId: "inv-other",
          isPaid: false,
          isPercentage: false,
          amount: new Decimal("100.00"),
        });

        await expect(
          caller.createStripeCheckout({
            token: "test-portal-token",
            partialPaymentId: "pp-other",
          })
        ).rejects.toThrow("Invalid installment");
      });

      it("throws BAD_REQUEST for partial payment not found", async () => {
        const invoice = makeInvoice();
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.partialPayment.findUnique.mockResolvedValue(null);

        await expect(
          caller.createStripeCheckout({
            token: "test-portal-token",
            partialPaymentId: "pp-nonexistent",
          })
        ).rejects.toThrow("Invalid installment");
      });

      it("throws BAD_REQUEST for already-paid installment", async () => {
        const invoice = makeInvoice();
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.partialPayment.findUnique.mockResolvedValue({
          id: "pp-1",
          invoiceId: "inv-1",
          isPaid: true,
          isPercentage: false,
          amount: new Decimal("100.00"),
        });

        await expect(
          caller.createStripeCheckout({
            token: "test-portal-token",
            partialPaymentId: "pp-1",
          })
        ).rejects.toThrow("Installment already paid");
      });
    });

    describe("payFullBalance", () => {
      it("creates checkout for remaining balance", async () => {
        const invoice = makeInvoice({
          status: InvoiceStatus.PARTIALLY_PAID,
          total: new Decimal("500.00"),
          payments: [
            { amount: new Decimal("200.00"), paidAt: new Date() },
          ],
        });
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

        const result = await caller.createStripeCheckout({
          token: "test-portal-token",
          payFullBalance: true,
        });

        expect(result.url).toBe("https://checkout.stripe.com/session/test");
        expect(createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            amountOverride: 300, // 500 - 200
          })
        );
      });

      it("creates checkout for full amount when no payments exist", async () => {
        const invoice = makeInvoice({
          status: InvoiceStatus.SENT,
          total: new Decimal("750.00"),
          payments: [],
        });
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

        const result = await caller.createStripeCheckout({
          token: "test-portal-token",
          payFullBalance: true,
        });

        expect(result.url).toBe("https://checkout.stripe.com/session/test");
        expect(createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            amountOverride: 750,
          })
        );
      });

      it("throws BAD_REQUEST when invoice already fully paid via payments", async () => {
        const invoice = makeInvoice({
          status: InvoiceStatus.SENT, // status not yet updated but payments cover total
          total: new Decimal("500.00"),
          payments: [
            { amount: new Decimal("300.00"), paidAt: new Date() },
            { amount: new Decimal("200.00"), paidAt: new Date() },
          ],
        });
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);

        await expect(
          caller.createStripeCheckout({
            token: "test-portal-token",
            payFullBalance: true,
          })
        ).rejects.toThrow("Invoice already fully paid");
      });

      it("throws BAD_REQUEST when payments exceed total (overpaid)", async () => {
        const invoice = makeInvoice({
          status: InvoiceStatus.SENT,
          total: new Decimal("100.00"),
          payments: [
            { amount: new Decimal("150.00"), paidAt: new Date() },
          ],
        });
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);

        await expect(
          caller.createStripeCheckout({
            token: "test-portal-token",
            payFullBalance: true,
          })
        ).rejects.toThrow("Invoice already fully paid");
      });
    });

    it("passes surcharge from gateway to createCheckoutSession", async () => {
      const invoice = makeInvoice();
      ctx.db.invoice.findUnique.mockResolvedValue(invoice);
      ctx.db.gatewaySetting.findUnique.mockResolvedValue({
        ...mockGateway,
        surcharge: new Decimal("3.75"),
      });

      await caller.createStripeCheckout({ token: "test-portal-token" });

      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          surcharge: 3.75,
        })
      );
    });

    it("uses NEXT_PUBLIC_APP_URL for the app URL", async () => {
      const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
      process.env.NEXT_PUBLIC_APP_URL = "https://myapp.com";

      try {
        const invoice = makeInvoice();
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

        await caller.createStripeCheckout({ token: "test-portal-token" });

        expect(createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            appUrl: "https://myapp.com",
          })
        );
      } finally {
        if (originalEnv === undefined) {
          delete process.env.NEXT_PUBLIC_APP_URL;
        } else {
          process.env.NEXT_PUBLIC_APP_URL = originalEnv;
        }
      }
    });

    it("defaults to localhost when NEXT_PUBLIC_APP_URL is not set", async () => {
      const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;

      try {
        const invoice = makeInvoice();
        ctx.db.invoice.findUnique.mockResolvedValue(invoice);
        ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockGateway);

        await caller.createStripeCheckout({ token: "test-portal-token" });

        expect(createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            appUrl: "http://localhost:3000",
          })
        );
      } finally {
        if (originalEnv === undefined) {
          delete process.env.NEXT_PUBLIC_APP_URL;
        } else {
          process.env.NEXT_PUBLIC_APP_URL = originalEnv;
        }
      }
    });
  });
});

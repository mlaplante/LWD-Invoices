import { describe, it, expect, beforeEach, vi } from "vitest";
import { gatewaySettingsRouter } from "@/server/routers/gatewaySettings";
import { createMockContext } from "./mocks/trpc-context";
import { GatewayType } from "@/generated/prisma";
import * as encryptionService from "@/server/services/encryption";

// Mock the encryption service
vi.mock("@/server/services/encryption", () => ({
  encryptJson: vi.fn(),
  decryptJson: vi.fn(),
}));

describe("Gateway Settings Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = gatewaySettingsRouter.createCaller(ctx);
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("retrieves organization's gateway settings", async () => {
      const mockSettingStripe = {
        id: "gs_stripe_123",
        organizationId: "test-org-123",
        gatewayType: GatewayType.STRIPE,
        configJson: "encrypted:data:here",
        isEnabled: true,
        surcharge: 2.9,
        label: "Credit Card",
      };

      const mockSettingPaypal = {
        id: "gs_paypal_123",
        organizationId: "test-org-123",
        gatewayType: GatewayType.PAYPAL,
        configJson: "encrypted:paypal:data",
        isEnabled: false,
        surcharge: 0,
        label: "PayPal",
      };

      ctx.db.gatewaySetting.findMany.mockResolvedValue([
        mockSettingStripe,
        mockSettingPaypal,
      ]);

      vi.mocked(encryptionService.decryptJson).mockImplementation((data) => {
        if (data === "encrypted:data:here") {
          return {
            secretKey: "sk_test_123",
            publishableKey: "pk_test_123",
            webhookSecret: "whsec_test_123",
          };
        }
        if (data === "encrypted:paypal:data") {
          return { email: "test@paypal.com" };
        }
        return {};
      });

      const result = await caller.list();

      expect(result).toHaveLength(2);
      expect(result[0].gatewayType).toBe(GatewayType.STRIPE);
      expect(result[0].isEnabled).toBe(true);
      expect(result[0].surcharge).toBe(2.9);
      // Stripe should only return publishableKey in safe config
      expect(result[0].safeConfig).toEqual({ publishableKey: "pk_test_123" });
      expect(result[1].gatewayType).toBe(GatewayType.PAYPAL);
      // PayPal should only return email
      expect(result[1].safeConfig).toEqual({ email: "test@paypal.com" });
      expect(ctx.db.gatewaySetting.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123" },
        orderBy: { gatewayType: "asc" },
      });
    });

    it("filters settings by organization isolation", async () => {
      ctx.db.gatewaySetting.findMany.mockResolvedValue([]);

      await caller.list();

      // Verify that only settings for the current org are fetched
      expect(ctx.db.gatewaySetting.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123" },
        orderBy: { gatewayType: "asc" },
      });

      // Verify the where clause includes orgId to prevent cross-org access
      const callArgs = ctx.db.gatewaySetting.findMany.mock.calls[0][0];
      expect(callArgs.where.organizationId).toBe("test-org-123");
    });

    it("handles decryption errors gracefully", async () => {
      const mockSetting = {
        id: "gs_stripe_123",
        organizationId: "test-org-123",
        gatewayType: GatewayType.STRIPE,
        configJson: "invalid:encrypted:data",
        isEnabled: true,
        surcharge: 0,
        label: null,
      };

      ctx.db.gatewaySetting.findMany.mockResolvedValue([mockSetting]);
      vi.mocked(encryptionService.decryptJson).mockImplementation(() => {
        throw new Error("Decryption failed");
      });

      const result = await caller.list();

      expect(result).toHaveLength(1);
      expect(result[0].safeConfig).toEqual({});
    });
  });

  describe("upsert", () => {
    it("creates new Stripe gateway configuration", async () => {
      const mockResult = {
        id: "gs_stripe_new",
        organizationId: "test-org-123",
        gatewayType: GatewayType.STRIPE,
        configJson: "encrypted:stripe:config",
        isEnabled: true,
        surcharge: 2.9,
        label: "Credit Card",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(encryptionService.encryptJson).mockReturnValue(
        "encrypted:stripe:config",
      );

      ctx.db.gatewaySetting.upsert.mockResolvedValue(mockResult);

      const result = await caller.upsert({
        gatewayType: GatewayType.STRIPE,
        isEnabled: true,
        surcharge: 2.9,
        label: "Credit Card",
        config: {
          secretKey: "sk_test_456",
          publishableKey: "pk_test_456",
          webhookSecret: "whsec_test_456",
        },
      });

      expect(result.id).toBe("gs_stripe_new");
      expect(result.gatewayType).toBe(GatewayType.STRIPE);
      expect(result.isEnabled).toBe(true);
      expect(ctx.db.gatewaySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_gatewayType: {
              organizationId: "test-org-123",
              gatewayType: GatewayType.STRIPE,
            },
          },
          create: expect.objectContaining({
            organizationId: "test-org-123",
            gatewayType: GatewayType.STRIPE,
            isEnabled: true,
            surcharge: 2.9,
            label: "Credit Card",
          }),
        }),
      );
    });

    it("updates existing PayPal gateway configuration", async () => {
      const mockResult = {
        id: "gs_paypal_existing",
        organizationId: "test-org-123",
        gatewayType: GatewayType.PAYPAL,
        configJson: "encrypted:paypal:updated",
        isEnabled: true,
        surcharge: 1.5,
        label: "PayPal Express",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(encryptionService.encryptJson).mockReturnValue(
        "encrypted:paypal:updated",
      );

      ctx.db.gatewaySetting.upsert.mockResolvedValue(mockResult);

      const result = await caller.upsert({
        gatewayType: GatewayType.PAYPAL,
        isEnabled: true,
        surcharge: 1.5,
        label: "PayPal Express",
        config: {
          email: "business@example.com",
        },
      });

      expect(result.id).toBe("gs_paypal_existing");
      expect(result.surcharge).toBe(1.5);
      expect(ctx.db.gatewaySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_gatewayType: {
              organizationId: "test-org-123",
              gatewayType: GatewayType.PAYPAL,
            },
          },
        }),
      );
    });

    it("validates Stripe configuration requires all required fields", async () => {
      try {
        await caller.upsert({
          gatewayType: GatewayType.STRIPE,
          config: {
            secretKey: "sk_test_123",
            // Missing publishableKey and webhookSecret
            publishableKey: "pk_test_123",
          },
        });
        expect.fail("Should have thrown validation error");
      } catch (err: any) {
        expect(err.code).toMatch(/BAD_REQUEST|PARSE_ERROR/);
      }
    });

    it("encrypts gateway credentials before storing", async () => {
      vi.mocked(encryptionService.encryptJson).mockReturnValue(
        "encrypted:result",
      );

      ctx.db.gatewaySetting.upsert.mockResolvedValue({
        id: "gs_test",
        organizationId: "test-org-123",
        gatewayType: GatewayType.STRIPE,
        configJson: "encrypted:result",
        isEnabled: true,
        surcharge: 0,
        label: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const config = {
        secretKey: "sk_secret_key_123",
        publishableKey: "pk_public_key_456",
        webhookSecret: "whsec_webhook_789",
      };

      await caller.upsert({
        gatewayType: GatewayType.STRIPE,
        config,
      });

      // Verify encryption was called with the config
      expect(encryptionService.encryptJson).toHaveBeenCalledWith(config);

      // Verify the encrypted value was passed to database
      const upsertCall = ctx.db.gatewaySetting.upsert.mock.calls[0][0];
      expect(upsertCall.create.configJson).toBe("encrypted:result");
    });

    it("prevents cross-organization gateway access during upsert", async () => {
      vi.mocked(encryptionService.encryptJson).mockReturnValue(
        "encrypted:data",
      );

      ctx.db.gatewaySetting.upsert.mockResolvedValue({
        id: "gs_test",
        organizationId: "test-org-123",
        gatewayType: GatewayType.STRIPE,
        configJson: "encrypted:data",
        isEnabled: true,
        surcharge: 0,
        label: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await caller.upsert({
        gatewayType: GatewayType.STRIPE,
        config: {
          secretKey: "sk_test",
          publishableKey: "pk_test",
          webhookSecret: "whsec_test",
        },
      });

      const callArgs = ctx.db.gatewaySetting.upsert.mock.calls[0][0];
      // Verify that organizationId is always set to current org
      expect(callArgs.where.organizationId_gatewayType.organizationId).toBe(
        "test-org-123",
      );
      expect(callArgs.create.organizationId).toBe("test-org-123");
    });

    it("validates PayPal email format", async () => {
      try {
        await caller.upsert({
          gatewayType: GatewayType.PAYPAL,
          config: {
            email: "not-an-email",
          },
        });
        expect.fail("Should have thrown validation error");
      } catch (err: any) {
        expect(err.code).toMatch(/BAD_REQUEST|PARSE_ERROR/);
      }
    });

    it("supports manual payment gateway types (Bank Transfer, Cash, Check, Money Order)", async () => {
      const manualGateways = [
        GatewayType.BANK_TRANSFER,
        GatewayType.CASH,
        GatewayType.CHECK,
        GatewayType.MONEY_ORDER,
      ];

      for (const gatewayType of manualGateways) {
        vi.mocked(encryptionService.encryptJson).mockReturnValue(
          `encrypted:${gatewayType}:config`,
        );

        ctx.db.gatewaySetting.upsert.mockResolvedValue({
          id: `gs_${gatewayType}_123`,
          organizationId: "test-org-123",
          gatewayType,
          configJson: `encrypted:${gatewayType}:config`,
          isEnabled: true,
          surcharge: 0,
          label: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await caller.upsert({
          gatewayType,
          config: { instructions: "Payment instructions here" },
        });

        expect(result.gatewayType).toBe(gatewayType);
        expect(ctx.db.gatewaySetting.upsert).toHaveBeenCalled();
      }
    });

    it("allows optional config fields for manual payment methods", async () => {
      vi.mocked(encryptionService.encryptJson).mockReturnValue(
        "encrypted:bank:config",
      );

      ctx.db.gatewaySetting.upsert.mockResolvedValue({
        id: "gs_bank_123",
        organizationId: "test-org-123",
        gatewayType: GatewayType.BANK_TRANSFER,
        configJson: "encrypted:bank:config",
        isEnabled: true,
        surcharge: 0,
        label: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.upsert({
        gatewayType: GatewayType.BANK_TRANSFER,
        config: {}, // Empty config with default instructions
      });

      expect(result.gatewayType).toBe(GatewayType.BANK_TRANSFER);
    });
  });

  describe("toggle", () => {
    it("enables/disables gateway setting", async () => {
      const mockExisting = {
        id: "gs_stripe_123",
        organizationId: "test-org-123",
        gatewayType: GatewayType.STRIPE,
        configJson: "encrypted:data",
        isEnabled: false,
        surcharge: 2.9,
        label: "Credit Card",
      };

      const mockUpdated = { ...mockExisting, isEnabled: true };

      ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockExisting);
      ctx.db.gatewaySetting.update.mockResolvedValue(mockUpdated);

      const result = await caller.toggle({
        gatewayType: GatewayType.STRIPE,
        isEnabled: true,
      });

      expect(result.isEnabled).toBe(true);
      expect(ctx.db.gatewaySetting.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_gatewayType: {
            organizationId: "test-org-123",
            gatewayType: GatewayType.STRIPE,
          },
        },
      });
      expect(ctx.db.gatewaySetting.update).toHaveBeenCalledWith({
        where: { id: "gs_stripe_123" },
        data: { isEnabled: true },
      });
    });

    it("throws NOT_FOUND when gateway setting doesn't exist", async () => {
      ctx.db.gatewaySetting.findUnique.mockResolvedValue(null);

      try {
        await caller.toggle({
          gatewayType: GatewayType.STRIPE,
          isEnabled: true,
        });
        expect.fail("Should have thrown NOT_FOUND error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("prevents cross-organization gateway access during toggle", async () => {
      const mockExisting = {
        id: "gs_stripe_123",
        organizationId: "test-org-123",
        gatewayType: GatewayType.STRIPE,
        configJson: "encrypted:data",
        isEnabled: false,
        surcharge: 0,
        label: null,
      };

      ctx.db.gatewaySetting.findUnique.mockResolvedValue(mockExisting);
      ctx.db.gatewaySetting.update.mockResolvedValue({
        ...mockExisting,
        isEnabled: true,
      });

      await caller.toggle({
        gatewayType: GatewayType.STRIPE,
        isEnabled: true,
      });

      const callArgs = ctx.db.gatewaySetting.findUnique.mock.calls[0][0];
      // Verify that organizationId is always included to prevent cross-org access
      expect(callArgs.where.organizationId_gatewayType.organizationId).toBe(
        "test-org-123",
      );
    });
  });
});

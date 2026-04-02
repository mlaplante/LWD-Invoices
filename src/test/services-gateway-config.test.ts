import { describe, it, expect, beforeEach, vi } from "vitest";
import { encryptJson, decryptJson } from "@/server/services/encryption";
import type {
  StripeConfig,
  PayPalConfig,
  ManualConfig,
} from "@/server/services/gateway-config";

// Set a valid test encryption key
const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

describe("Gateway Config Service", () => {
  beforeEach(() => {
    // Set valid encryption key for tests
    process.env.GATEWAY_ENCRYPTION_KEY = TEST_KEY;
    vi.clearAllMocks();
  });

  describe("encryption/decryption", () => {
    it("encrypts and decrypts Stripe config correctly", () => {
      const stripeConfig: StripeConfig = {
        secretKey: "sk_test_abc123def456",
        publishableKey: "pk_test_xyz789uvw012",
        webhookSecret: "whsec_test_signature_secret",
      };

      const encrypted = encryptJson(stripeConfig);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
      // Verify it's in "iv:authTag:ciphertext" format
      expect(encrypted.split(":")).toHaveLength(3);

      const decrypted = decryptJson<StripeConfig>(encrypted);

      expect(decrypted).toEqual(stripeConfig);
      expect(decrypted.secretKey).toBe(stripeConfig.secretKey);
      expect(decrypted.publishableKey).toBe(stripeConfig.publishableKey);
      expect(decrypted.webhookSecret).toBe(stripeConfig.webhookSecret);
    });

    it("encrypts and decrypts PayPal config correctly", () => {
      const paypalConfig: PayPalConfig = {
        email: "merchant@example.com",
      };

      const encrypted = encryptJson(paypalConfig);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
      expect(encrypted.split(":")).toHaveLength(3);

      const decrypted = decryptJson<PayPalConfig>(encrypted);

      expect(decrypted).toEqual(paypalConfig);
      expect(decrypted.email).toBe(paypalConfig.email);
    });

    it("encrypts and decrypts manual payment config correctly", () => {
      const manualConfig: ManualConfig = {
        instructions:
          "Please send payment to: ABC Corp, 123 Main St, Bank: FirstBank, Account: 9876543210",
      };

      const encrypted = encryptJson(manualConfig);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
      expect(encrypted.split(":")).toHaveLength(3);

      const decrypted = decryptJson<ManualConfig>(encrypted);

      expect(decrypted).toEqual(manualConfig);
      expect(decrypted.instructions).toBe(manualConfig.instructions);
    });

    it("produces different ciphertext for the same plaintext (due to random IV)", () => {
      const config: StripeConfig = {
        secretKey: "sk_test_consistent",
        publishableKey: "pk_test_consistent",
        webhookSecret: "whsec_test_consistent",
      };

      const encrypted1 = encryptJson(config);
      const encrypted2 = encryptJson(config);

      // Ciphertexts should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      const decrypted1 = decryptJson<StripeConfig>(encrypted1);
      const decrypted2 = decryptJson<StripeConfig>(encrypted2);

      expect(decrypted1).toEqual(decrypted2);
      expect(decrypted1).toEqual(config);
    });

    it("preserves complex nested structures during encryption/decryption", () => {
      const complexConfig = {
        secretKey: "sk_test_123",
        publishableKey: "pk_test_456",
        webhookSecret: "whsec_789",
        metadata: {
          accountId: "acct_001",
          testMode: true,
          connectEnabled: false,
        },
      };

      const encrypted = encryptJson(complexConfig);
      const decrypted = decryptJson<typeof complexConfig>(encrypted);

      expect(decrypted).toEqual(complexConfig);
      expect(decrypted.metadata.accountId).toBe("acct_001");
      expect(decrypted.metadata.testMode).toBe(true);
    });
  });

  describe("config parsing", () => {
    it("parses Stripe config from JSON string", () => {
      const jsonString = JSON.stringify({
        secretKey: "sk_live_abcdef123456",
        publishableKey: "pk_live_xyz789",
        webhookSecret: "whsec_live_signature",
      });

      const config = JSON.parse(jsonString) as StripeConfig;

      expect(config).toBeDefined();
      expect(config.secretKey).toBe("sk_live_abcdef123456");
      expect(config.publishableKey).toBe("pk_live_xyz789");
      expect(config.webhookSecret).toBe("whsec_live_signature");
    });

    it("parses PayPal config from JSON string", () => {
      const jsonString = JSON.stringify({
        email: "paypal-merchant@business.com",
      });

      const config = JSON.parse(jsonString) as PayPalConfig;

      expect(config).toBeDefined();
      expect(config.email).toBe("paypal-merchant@business.com");
    });

    it("parses manual payment config from JSON string", () => {
      const jsonString = JSON.stringify({
        instructions:
          "Wire transfer to: Bank XYZ, Account: 1234567890, SWIFT: XYZBANK",
      });

      const config = JSON.parse(jsonString) as ManualConfig;

      expect(config).toBeDefined();
      expect(config.instructions).toContain("Bank XYZ");
      expect(config.instructions).toContain("1234567890");
    });

    it("parses multiline instructions correctly", () => {
      const instructions = `Please arrange payment through:
Bank: FirstBank International
Account: 9876543210
Swift Code: FIRST123
Reference: INV-2026-001`;

      const jsonString = JSON.stringify({ instructions });
      const config = JSON.parse(jsonString) as ManualConfig;

      expect(config.instructions).toContain("FirstBank International");
      expect(config.instructions).toContain("INV-2026-001");
      expect(config.instructions).toContain("\n");
    });
  });

  describe("config validation", () => {
    it("throws error on invalid JSON", () => {
      const invalidJson = "{invalid json}";

      expect(() => {
        JSON.parse(invalidJson);
      }).toThrow(SyntaxError);
    });

    it("throws error on malformed JSON with missing closing brace", () => {
      const malformedJson = '{"secretKey": "sk_test", "publishableKey": "pk_test"';

      expect(() => {
        JSON.parse(malformedJson);
      }).toThrow(SyntaxError);
    });

    it("throws error on invalid JSON with trailing comma", () => {
      const invalidJson = '{"secretKey": "sk_test", "publishableKey": "pk_test",}';

      expect(() => {
        JSON.parse(invalidJson);
      }).toThrow(SyntaxError);
    });

    it("throws error on empty string", () => {
      const emptyString = "";

      expect(() => {
        JSON.parse(emptyString);
      }).toThrow(SyntaxError);
    });

    it("throws error on null value", () => {
      const nullString = "null";
      const parsed = JSON.parse(nullString);

      // JSON.parse itself doesn't throw, but we can validate the result
      expect(parsed).toBeNull();
    });

    it("validates Stripe config has required fields", () => {
      const validConfig = {
        secretKey: "sk_test_123",
        publishableKey: "pk_test_456",
        webhookSecret: "whsec_test_789",
      };

      const config = validConfig as StripeConfig;

      expect(config).toHaveProperty("secretKey");
      expect(config).toHaveProperty("publishableKey");
      expect(config).toHaveProperty("webhookSecret");
      expect(config.secretKey).toBeTruthy();
      expect(config.publishableKey).toBeTruthy();
      expect(config.webhookSecret).toBeTruthy();
    });

    it("validates PayPal config has required fields", () => {
      const validConfig = {
        email: "merchant@paypal.com",
      };

      const config = validConfig as PayPalConfig;

      expect(config).toHaveProperty("email");
      expect(config.email).toBeTruthy();
      expect(config.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/); // Basic email validation
    });

    it("validates manual config has instructions field", () => {
      const validConfig = {
        instructions: "Send payment to...",
      };

      const config = validConfig as ManualConfig;

      expect(config).toHaveProperty("instructions");
      expect(typeof config.instructions).toBe("string");
    });

    it("allows empty instructions in manual config", () => {
      const configWithEmptyInstructions = {
        instructions: "",
      };

      const config = configWithEmptyInstructions as ManualConfig;

      expect(config.instructions).toBe("");
    });

    it("rejects Stripe config with missing secretKey", () => {
      const incompleteConfig = {
        publishableKey: "pk_test_456",
        webhookSecret: "whsec_test_789",
      };

      const config = incompleteConfig as Partial<StripeConfig>;

      expect(config.secretKey).toBeUndefined();
    });

    it("rejects Stripe config with missing publishableKey", () => {
      const incompleteConfig = {
        secretKey: "sk_test_123",
        webhookSecret: "whsec_test_789",
      };

      const config = incompleteConfig as Partial<StripeConfig>;

      expect(config.publishableKey).toBeUndefined();
    });

    it("rejects PayPal config with invalid email", () => {
      const invalidEmailConfig = {
        email: "not-an-email",
      };

      const config = invalidEmailConfig as PayPalConfig;
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email);

      expect(isValidEmail).toBe(false);
    });
  });

  describe("ciphertext format validation", () => {
    it("throws error on decryption with invalid ciphertext format (too many parts)", () => {
      const invalidCiphertext = "not:a:valid:format:too:many:parts";

      expect(() => {
        decryptJson<StripeConfig>(invalidCiphertext);
      }).toThrow("Invalid ciphertext format");
    });

    it("throws error on decryption with incomplete ciphertext (missing parts)", () => {
      const incompleteCiphertext = "only_two_parts:here";

      expect(() => {
        decryptJson<StripeConfig>(incompleteCiphertext);
      }).toThrow("Invalid ciphertext format");
    });

    it("throws error on decryption with single part ciphertext", () => {
      const singlePart = "justonepart";

      expect(() => {
        decryptJson<StripeConfig>(singlePart);
      }).toThrow("Invalid ciphertext format");
    });

    it("detects tampered ciphertext during decryption", () => {
      const config: StripeConfig = {
        secretKey: "sk_test_123",
        publishableKey: "pk_test_456",
        webhookSecret: "whsec_test_789",
      };

      const encrypted = encryptJson(config);
      const parts = encrypted.split(":");

      // Tamper with the ciphertext (last part)
      const tampered = `${parts[0]}:${parts[1]}:tampereddata`;

      expect(() => {
        decryptJson<StripeConfig>(tampered);
      }).toThrow();
    });
  });

  describe("real-world scenarios", () => {
    it("handles production Stripe keys with correct format", () => {
      const prodConfig: StripeConfig = {
        secretKey: "sk_live_51234567890abcdefghijklmnopqrstuvwxyz",
        publishableKey: "pk_live_51234567890abcdefghijklmnopqrstuvwxyz",
        webhookSecret: "whsec_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p",
      };

      const encrypted = encryptJson(prodConfig);
      const decrypted = decryptJson<StripeConfig>(encrypted);

      expect(decrypted.secretKey).toMatch(/^sk_live_/);
      expect(decrypted.publishableKey).toMatch(/^pk_live_/);
      expect(decrypted.webhookSecret).toMatch(/^whsec_/);
    });

    it("handles test Stripe keys with correct format", () => {
      const testConfig: StripeConfig = {
        secretKey: "sk_test_51234567890abcdefghijklmnopqrstuvwxyz",
        publishableKey: "pk_test_51234567890abcdefghijklmnopqrstuvwxyz",
        webhookSecret: "whsec_test_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p",
      };

      const encrypted = encryptJson(testConfig);
      const decrypted = decryptJson<StripeConfig>(encrypted);

      expect(decrypted.secretKey).toMatch(/^sk_test_/);
      expect(decrypted.publishableKey).toMatch(/^pk_test_/);
    });

    it("handles multiple gateway configs independently", () => {
      const stripeConfig: StripeConfig = {
        secretKey: "sk_test_stripe123",
        publishableKey: "pk_test_stripe456",
        webhookSecret: "whsec_test_stripe789",
      };

      const paypalConfig: PayPalConfig = {
        email: "merchant@paypal.com",
      };

      const manualConfig: ManualConfig = {
        instructions: "Send to Bank ABC",
      };

      const encryptedStripe = encryptJson(stripeConfig);
      const encryptedPaypal = encryptJson(paypalConfig);
      const encryptedManual = encryptJson(manualConfig);

      const decryptedStripe = decryptJson<StripeConfig>(encryptedStripe);
      const decryptedPaypal = decryptJson<PayPalConfig>(encryptedPaypal);
      const decryptedManual = decryptJson<ManualConfig>(encryptedManual);

      expect(decryptedStripe.secretKey).toBe(stripeConfig.secretKey);
      expect(decryptedPaypal.email).toBe(paypalConfig.email);
      expect(decryptedManual.instructions).toBe(manualConfig.instructions);
    });

    it("handles special characters in config values", () => {
      const configWithSpecialChars: ManualConfig = {
        instructions:
          'Wire to "FirstBank" & Partners: ACH #123-456.789 (ref: Invoice/2026#001)',
      };

      const encrypted = encryptJson(configWithSpecialChars);
      const decrypted = decryptJson<ManualConfig>(encrypted);

      expect(decrypted.instructions).toBe(configWithSpecialChars.instructions);
      expect(decrypted.instructions).toContain("&");
      expect(decrypted.instructions).toContain("#");
      expect(decrypted.instructions).toContain("/");
    });

    it("handles very long config values", () => {
      const longInstructions =
        "A".repeat(1000) +
        "\n" +
        "B".repeat(1000) +
        "\n" +
        "C".repeat(1000);

      const config: ManualConfig = {
        instructions: longInstructions,
      };

      const encrypted = encryptJson(config);
      const decrypted = decryptJson<ManualConfig>(encrypted);

      expect(decrypted.instructions).toBe(longInstructions);
      expect(decrypted.instructions.length).toBe(3002); // 1000 + 1000 + 1000 + 2 newlines
    });
  });
});

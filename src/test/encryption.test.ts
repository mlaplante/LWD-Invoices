import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptJson, decryptJson } from "@/server/services/encryption";

// Set up a valid test key for encryption tests
const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("Encryption Service", () => {
  beforeEach(() => {
    process.env.GATEWAY_ENCRYPTION_KEY = TEST_KEY;
  });

  describe("encryptJson", () => {
    it("encrypts a simple object", () => {
      const obj = { foo: "bar" };
      const encrypted = encryptJson(obj);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
      expect(encrypted).toContain(":");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
    });

    it("encrypts objects with nested properties", () => {
      const obj = {
        user: { id: "123", name: "John" },
        active: true,
      };

      const encrypted = encryptJson(obj);

      expect(encrypted).toBeDefined();
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
    });

    it("encrypts arrays", () => {
      const arr = [1, 2, 3, { key: "value" }];

      const encrypted = encryptJson(arr);

      expect(encrypted).toBeDefined();
    });

    it("encrypts strings", () => {
      const str = "hello world";

      const encrypted = encryptJson(str);

      expect(encrypted).toBeDefined();
    });

    it("encrypts numbers", () => {
      const num = 42;

      const encrypted = encryptJson(num);

      expect(encrypted).toBeDefined();
    });

    it("encrypts null", () => {
      const nullEncrypted = encryptJson(null);
      expect(nullEncrypted).toBeDefined();
      const parts = nullEncrypted.split(":");
      expect(parts).toHaveLength(3);
    });


    it("generates different ciphertext for same input (due to random IV)", () => {
      const obj = { test: "data" };

      const encrypted1 = encryptJson(obj);
      const encrypted2 = encryptJson(obj);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe("decryptJson", () => {
    it("decrypts encrypted object", () => {
      const original = { foo: "bar", num: 42 };
      const encrypted = encryptJson(original);

      const decrypted = decryptJson(encrypted);

      expect(decrypted).toEqual(original);
    });

    it("decrypts nested objects", () => {
      const original = {
        user: { id: "123", name: "John", email: "john@example.com" },
        active: true,
        tags: ["a", "b", "c"],
      };

      const encrypted = encryptJson(original);
      const decrypted = decryptJson(encrypted);

      expect(decrypted).toEqual(original);
    });

    it("decrypts arrays", () => {
      const original = [1, 2, 3, { key: "value" }, ["nested", "array"]];

      const encrypted = encryptJson(original);
      const decrypted = decryptJson(encrypted);

      expect(decrypted).toEqual(original);
    });

    it("decrypts with type preservation", () => {
      const original = {
        string: "hello",
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
      };

      const encrypted = encryptJson(original);
      const decrypted = decryptJson<typeof original>(encrypted);

      expect(decrypted.string).toBe("hello");
      expect(decrypted.number).toBe(42);
      expect(decrypted.boolean).toBe(true);
      expect(decrypted.null).toBe(null);
      expect(decrypted.array).toEqual([1, 2, 3]);
    });

    it("throws error for invalid ciphertext format", () => {
      expect(() => {
        decryptJson("invalid:format");
      }).toThrow("Invalid ciphertext format");
    });

    it("throws error for malformed base64", () => {
      expect(() => {
        decryptJson("!!!:!!!:!!!");
      }).toThrow();
    });

    it("throws error when decrypting with wrong ciphertext", () => {
      const original = { secret: "data" };
      const encrypted = encryptJson(original);

      // Manually create invalid ciphertext
      const invalidCiphertext = "dGVzdA==:dGVzdA==:dGVzdA==";

      expect(() => {
        decryptJson(invalidCiphertext);
      }).toThrow();
    });

    it("throws error when auth tag is modified", () => {
      const original = { secret: "data" };
      const encrypted = encryptJson(original);

      const parts = encrypted.split(":");
      // Corrupt the auth tag
      const corrupted =
        parts[0] + ":" + "AAAAAAAAAAAAAAAA" + ":" + parts[2];

      expect(() => {
        decryptJson(corrupted);
      }).toThrow();
    });
  });

  describe("Round-trip encryption/decryption", () => {
    beforeEach(() => {
      process.env.GATEWAY_ENCRYPTION_KEY = TEST_KEY;
    });

    it("handles complex nested structure", () => {
      const original = {
        customer: {
          id: "cust_123",
          name: "Acme Corp",
          email: "contact@acme.com",
          addresses: [
            { type: "billing", street: "123 Main St" },
            { type: "shipping", street: "456 Oak Ave" },
          ],
        },
        orders: [
          {
            id: "order_1",
            amount: 1599.99,
            items: 3,
            paid: true,
          },
        ],
        metadata: {
          created: "2026-02-26",
          source: "api",
        },
      };

      const encrypted = encryptJson(original);
      const decrypted = decryptJson<typeof original>(encrypted);

      expect(decrypted).toEqual(original);
    });

    it("preserves special characters and unicode", () => {
      const original = {
        text: "Hello, 世界! 🌍",
        emoji: "😀🎉🚀",
        symbols: "!@#$%^&*()",
      };

      const encrypted = encryptJson(original);
      const decrypted = decryptJson<typeof original>(encrypted);

      expect(decrypted).toEqual(original);
    });

    it("handles large objects", () => {
      const large = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          value: Math.random() * 1000,
        })),
      };

      const encrypted = encryptJson(large);
      const decrypted = decryptJson<typeof large>(encrypted);

      expect(decrypted.items).toHaveLength(1000);
      expect(decrypted).toEqual(large);
    });

    it("handles empty objects and arrays", () => {
      const original = {
        empty: {},
        emptyArray: [],
      };

      const encrypted = encryptJson(original);
      const decrypted = decryptJson<typeof original>(encrypted);

      expect(decrypted).toEqual(original);
    });
  });
});

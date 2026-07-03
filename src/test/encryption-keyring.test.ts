import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptJson,
  decryptJson,
  encryptString,
  decryptString,
} from "@/server/services/encryption";

const KEY_A = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY_B = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const KEY_C = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("Encryption keyring (rotation support)", () => {
  const originalKey = process.env.GATEWAY_ENCRYPTION_KEY;
  const originalKeys = process.env.GATEWAY_ENCRYPTION_KEYS;

  beforeEach(() => {
    delete process.env.GATEWAY_ENCRYPTION_KEY;
    delete process.env.GATEWAY_ENCRYPTION_KEYS;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GATEWAY_ENCRYPTION_KEY;
    else process.env.GATEWAY_ENCRYPTION_KEY = originalKey;
    if (originalKeys === undefined) delete process.env.GATEWAY_ENCRYPTION_KEYS;
    else process.env.GATEWAY_ENCRYPTION_KEYS = originalKeys;
  });

  it("keeps the legacy 3-part envelope when only GATEWAY_ENCRYPTION_KEY is set", () => {
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_A;

    const encrypted = encryptJson({ secret: "value" });

    expect(encrypted.split(":")).toHaveLength(3);
    expect(decryptJson(encrypted)).toEqual({ secret: "value" });
  });

  it("writes a 4-part key-id envelope when a keyring is configured", () => {
    process.env.GATEWAY_ENCRYPTION_KEYS = `k1:${KEY_A}`;

    const encrypted = encryptJson({ secret: "value" });

    const parts = encrypted.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("k1");
    expect(decryptJson(encrypted)).toEqual({ secret: "value" });
  });

  it("encrypts with the FIRST ring entry and still decrypts older entries", () => {
    // Start on k1
    process.env.GATEWAY_ENCRYPTION_KEYS = `k1:${KEY_A}`;
    const oldCiphertext = encryptJson({ card: "4242" });

    // Rotate: prepend k2, keep k1 for decryption
    process.env.GATEWAY_ENCRYPTION_KEYS = `k2:${KEY_B},k1:${KEY_A}`;
    const newCiphertext = encryptJson({ card: "4242" });

    expect(newCiphertext.split(":")[0]).toBe("k2");
    expect(decryptJson(oldCiphertext)).toEqual({ card: "4242" }); // k1 still works
    expect(decryptJson(newCiphertext)).toEqual({ card: "4242" });
  });

  it("decrypts legacy envelopes via the ring when GATEWAY_ENCRYPTION_KEY is retired", () => {
    // Legacy value written with the single key
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_A;
    const legacyCiphertext = encryptJson({ legacy: true });

    // Retire GATEWAY_ENCRYPTION_KEY; old key moves into the ring
    delete process.env.GATEWAY_ENCRYPTION_KEY;
    process.env.GATEWAY_ENCRYPTION_KEYS = `k2:${KEY_B},k1:${KEY_A}`;

    expect(decryptJson(legacyCiphertext)).toEqual({ legacy: true });
  });

  it("fails loudly for an unknown key id", () => {
    process.env.GATEWAY_ENCRYPTION_KEYS = `k1:${KEY_A}`;
    const encrypted = encryptJson({ secret: "value" });

    process.env.GATEWAY_ENCRYPTION_KEYS = `k9:${KEY_C}`;

    expect(() => decryptJson(encrypted)).toThrow(/Unknown encryption key id "k1"/);
  });

  it("fails when no candidate key authenticates a legacy envelope", () => {
    process.env.GATEWAY_ENCRYPTION_KEY = KEY_A;
    const encrypted = encryptJson({ secret: "value" });

    process.env.GATEWAY_ENCRYPTION_KEY = KEY_B;
    process.env.GATEWAY_ENCRYPTION_KEYS = `k1:${KEY_C}`;

    expect(() => decryptJson(encrypted)).toThrow();
  });

  it("throws when no key material is configured at all", () => {
    expect(() => encryptJson({})).toThrow(/GATEWAY_ENCRYPTION_KEY/);
  });

  it("rejects malformed ring entries", () => {
    process.env.GATEWAY_ENCRYPTION_KEYS = "not-a-valid-entry";
    expect(() => encryptJson({})).toThrow(/<keyId>:<64-char hex>/);

    process.env.GATEWAY_ENCRYPTION_KEYS = "k1:tooshort";
    expect(() => encryptJson({})).toThrow(/64-char hex/);
  });

  it("round-trips encryptString/decryptString through the keyring", () => {
    process.env.GATEWAY_ENCRYPTION_KEYS = `k1:${KEY_A}`;

    const ciphertext = encryptString("123-45-6789");
    expect(decryptString(ciphertext)).toBe("123-45-6789");
  });
});

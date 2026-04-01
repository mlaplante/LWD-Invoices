import { describe, it, expect, beforeEach } from "vitest";
import {
  hashDocument,
  hashSignature,
  validateSignatureData,
  encryptSignature,
  decryptSignature,
  SIGNATURE_MAX_LENGTH,
} from "@/server/services/signature";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("Signature Helpers", () => {
  beforeEach(() => {
    process.env.GATEWAY_ENCRYPTION_KEY = TEST_KEY;
  });

  describe("hashDocument", () => {
    it("returns consistent SHA-256 hex for same input", () => {
      const sections = [
        { key: "intro", title: "Introduction", content: "Hello world" },
      ];
      const hash1 = hashDocument(sections);
      const hash2 = hashDocument(sections);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("returns different hashes for different content", () => {
      const sections1 = [
        { key: "intro", title: "Introduction", content: "Hello world" },
      ];
      const sections2 = [
        { key: "intro", title: "Introduction", content: "Goodbye world" },
      ];
      expect(hashDocument(sections1)).not.toBe(hashDocument(sections2));
    });

    it("returns different hashes for different keys", () => {
      const sections1 = [
        { key: "intro", title: "Introduction", content: "Hello" },
      ];
      const sections2 = [
        { key: "summary", title: "Introduction", content: "Hello" },
      ];
      expect(hashDocument(sections1)).not.toBe(hashDocument(sections2));
    });

    it("handles multiple sections", () => {
      const sections = [
        { key: "a", title: "A", content: "First" },
        { key: "b", title: "B", content: "Second" },
        { key: "c", title: "C", content: "Third" },
      ];
      const hash = hashDocument(sections);
      expect(hash).toHaveLength(64);
    });

    it("handles empty sections array", () => {
      const hash = hashDocument([]);
      expect(hash).toHaveLength(64);
    });
  });

  describe("hashSignature", () => {
    it("returns a 64-char hex hash", () => {
      const hash = hashSignature("data:image/png;base64,iVBOR...");
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it("returns consistent hash for same input", () => {
      const data = "M0,0 L100,100";
      expect(hashSignature(data)).toBe(hashSignature(data));
    });

    it("returns different hash for different input", () => {
      expect(hashSignature("abc")).not.toBe(hashSignature("def"));
    });
  });

  describe("validateSignatureData", () => {
    it("accepts PNG data URL", () => {
      expect(
        validateSignatureData("data:image/png;base64,iVBORw0KGgo=")
      ).toBe(true);
    });

    it("accepts JPEG data URL", () => {
      expect(
        validateSignatureData("data:image/jpeg;base64,/9j/4AAQ")
      ).toBe(true);
    });

    it("accepts SVG+XML data URL", () => {
      expect(
        validateSignatureData("data:image/svg+xml;base64,PHN2Zz4=")
      ).toBe(true);
    });

    it("accepts SVG path data", () => {
      expect(validateSignatureData("M0,0 L100,100 C50,50 75,25 100,0")).toBe(
        true
      );
    });

    it("accepts complex SVG path", () => {
      expect(
        validateSignatureData("M 10 20 L 30 40 Q 50 60 70 80 Z")
      ).toBe(true);
    });

    it("rejects empty string", () => {
      expect(validateSignatureData("")).toBe(false);
    });

    it("rejects null-ish values", () => {
      expect(validateSignatureData(null as any)).toBe(false);
      expect(validateSignatureData(undefined as any)).toBe(false);
    });

    it("rejects overlength data", () => {
      const longData = "data:image/png;base64," + "A".repeat(SIGNATURE_MAX_LENGTH);
      expect(validateSignatureData(longData)).toBe(false);
    });

    it("rejects random text", () => {
      expect(validateSignatureData("hello world! this is not valid")).toBe(
        false
      );
    });

    it("rejects HTML/script injection", () => {
      expect(validateSignatureData("<script>alert('xss')</script>")).toBe(
        false
      );
    });
  });

  describe("encryptSignature / decryptSignature", () => {
    it("round-trips signature data", () => {
      const original = "data:image/png;base64,iVBORw0KGgo=";
      const encrypted = encryptSignature(original);
      const decrypted = decryptSignature(encrypted);
      expect(decrypted).toBe(original);
    });

    it("produces different ciphertext each time (random IV)", () => {
      const data = "M0,0 L100,100";
      const e1 = encryptSignature(data);
      const e2 = encryptSignature(data);
      expect(e1).not.toBe(e2);
    });
  });
});

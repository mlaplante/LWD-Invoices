import { describe, it, expect } from "vitest";
import { groupByMonth } from "@/server/routers/reports";
import { validateCreditApplication } from "@/server/routers/creditNotes";
import bcrypt from "bcryptjs";

// Test hashPassphraseIfProvided logic (extracted from clients router)
async function hashPassphraseIfProvided(
  input: { portalPassphrase?: string },
): Promise<{ portalPassphraseHash?: string }> {
  if (!input.portalPassphrase) return {};
  const hash = await bcrypt.hash(input.portalPassphrase, 12);
  return { portalPassphraseHash: hash };
}

describe("Router Helper Functions", () => {
  describe("groupByMonth (Reports Router)", () => {
    it("groups items by month", () => {
      const items = [
        { date: new Date("2026-01-15"), amount: 100 },
        { date: new Date("2026-01-28"), amount: 50 },
        { date: new Date("2026-02-10"), amount: 200 },
      ];

      const result = groupByMonth(items, (i) => i.date, (i) => i.amount);

      expect(result["2026-01"]).toBe(150);
      expect(result["2026-02"]).toBe(200);
    });

    it("returns empty object for empty input", () => {
      const result = groupByMonth([], () => new Date(), () => 0);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("sums multiple items in same month", () => {
      const items = [
        { date: new Date("2026-01-10"), value: 10 },
        { date: new Date("2026-01-15"), value: 20 },
        { date: new Date("2026-01-25"), value: 30 },
      ];

      const result = groupByMonth(items, (i) => i.date, (i) => i.value);

      expect(result["2026-01"]).toBe(60);
    });

    it("handles different years", () => {
      const items = [
        { date: new Date("2025-12-15"), amount: 100 },
        { date: new Date("2026-01-15"), amount: 200 },
      ];

      const result = groupByMonth(items, (i) => i.date, (i) => i.amount);

      expect(result["2025-12"]).toBe(100);
      expect(result["2026-01"]).toBe(200);
    });

    it("handles single item", () => {
      const items = [{ date: new Date("2026-03-20"), amount: 500 }];

      const result = groupByMonth(items, (i) => i.date, (i) => i.amount);

      expect(result["2026-03"]).toBe(500);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("handles zero values", () => {
      const items = [
        { date: new Date("2026-01-10"), amount: 0 },
        { date: new Date("2026-01-20"), amount: 0 },
      ];

      const result = groupByMonth(items, (i) => i.date, (i) => i.amount);

      expect(result["2026-01"]).toBe(0);
    });

    it("handles negative values", () => {
      const items = [
        { date: new Date("2026-01-10"), amount: 100 },
        { date: new Date("2026-01-20"), amount: -50 },
      ];

      const result = groupByMonth(items, (i) => i.date, (i) => i.amount);

      expect(result["2026-01"]).toBe(50);
    });

    it("uses custom selector functions", () => {
      const items = [
        { timestamp: new Date("2026-02-05"), revenue: 1000 },
        { timestamp: new Date("2026-02-15"), revenue: 2000 },
      ];

      const result = groupByMonth(
        items,
        (i) => i.timestamp,
        (i) => i.revenue,
      );

      expect(result["2026-02"]).toBe(3000);
    });
  });

  describe("validateCreditApplication (CreditNotes Router)", () => {
    it("accepts valid amount", () => {
      expect(() => validateCreditApplication(50, 100, 100)).not.toThrow();
    });

    it("rejects amount exceeding credit note balance", () => {
      expect(() => validateCreditApplication(150, 100, 200)).toThrow(
        "exceeds",
      );
    });

    it("rejects amount exceeding invoice balance", () => {
      expect(() => validateCreditApplication(150, 200, 100)).toThrow(
        "exceeds",
      );
    });

    it("accepts amount equal to credit note balance", () => {
      expect(() => validateCreditApplication(100, 100, 200)).not.toThrow();
    });

    it("accepts amount equal to invoice balance", () => {
      expect(() => validateCreditApplication(100, 200, 100)).not.toThrow();
    });

    it("accepts zero amount", () => {
      expect(() => validateCreditApplication(0, 100, 100)).not.toThrow();
    });

    it("handles edge case: both limits equal and matching", () => {
      expect(() => validateCreditApplication(50, 50, 50)).not.toThrow();
    });

    it("handles edge case: one limit is zero", () => {
      expect(() => validateCreditApplication(0, 0, 100)).toThrow(
        "Credit note has no remaining balance"
      );
    });
  });

  describe("hashPassphraseIfProvided (Clients Router)", () => {
    it("returns empty object when no passphrase provided", async () => {
      const result = await hashPassphraseIfProvided({});
      expect(result).toEqual({});
    });

    it("returns empty object when passphrase is undefined", async () => {
      const result = await hashPassphraseIfProvided({ portalPassphrase: undefined });
      expect(result).toEqual({});
    });

    it("generates hash for valid passphrase", async () => {
      const result = await hashPassphraseIfProvided({
        portalPassphrase: "secure-password",
      });

      expect(result).toHaveProperty("portalPassphraseHash");
      expect(result.portalPassphraseHash).toBeDefined();
      expect(typeof result.portalPassphraseHash).toBe("string");
      expect(result.portalPassphraseHash!.length).toBeGreaterThan(0);
    });

    it("generates different hashes for same passphrase", async () => {
      const pass1 = await hashPassphraseIfProvided({
        portalPassphrase: "same-password",
      });
      const pass2 = await hashPassphraseIfProvided({
        portalPassphrase: "same-password",
      });

      // bcrypt salts each hash, so same password produces different hashes
      expect(pass1.portalPassphraseHash).not.toBe(
        pass2.portalPassphraseHash,
      );
    });

    it("handles long passphrase", async () => {
      const longPass = "x".repeat(100);
      const result = await hashPassphraseIfProvided({
        portalPassphrase: longPass,
      });

      expect(result).toHaveProperty("portalPassphraseHash");
      expect(result.portalPassphraseHash).toBeDefined();
    });

    it("handles special characters in passphrase", async () => {
      const result = await hashPassphraseIfProvided({
        portalPassphrase: "!@#$%^&*()_+-=[]{}|;:,.<>?",
      });

      expect(result).toHaveProperty("portalPassphraseHash");
      expect(result.portalPassphraseHash).toBeDefined();
    });

    it("handles unicode characters", async () => {
      const result = await hashPassphraseIfProvided({
        portalPassphrase: "пароль密码🔒",
      });

      expect(result).toHaveProperty("portalPassphraseHash");
      expect(result.portalPassphraseHash).toBeDefined();
    });

    it("hash can be verified with bcrypt", async () => {
      const password = "test-password";
      const { portalPassphraseHash } = await hashPassphraseIfProvided({
        portalPassphrase: password,
      });

      const isMatch = await bcrypt.compare(password, portalPassphraseHash!);
      expect(isMatch).toBe(true);
    });

    it("hash verification fails with wrong password", async () => {
      const { portalPassphraseHash } = await hashPassphraseIfProvided({
        portalPassphrase: "correct-password",
      });

      const isMatch = await bcrypt.compare(
        "wrong-password",
        portalPassphraseHash!,
      );
      expect(isMatch).toBe(false);
    });

    it("empty string passphrase treated as no passphrase", async () => {
      const result = await hashPassphraseIfProvided({
        portalPassphrase: "",
      });
      // Empty string is falsy, so should return {}
      expect(result).toEqual({});
    });
  });

  describe("Cross-Function Integration", () => {
    it("groupByMonth works with decimal amounts", () => {
      const items = [
        { date: new Date("2026-01-15"), amount: 100.5 },
        { date: new Date("2026-01-20"), amount: 50.25 },
      ];

      const result = groupByMonth(items, (i) => i.date, (i) => i.amount);
      expect(result["2026-01"]).toBeCloseTo(150.75, 2);
    });

    it("validateCreditApplication with large numbers", () => {
      expect(() =>
        validateCreditApplication(999999, 1000000, 1000000),
      ).not.toThrow();
    });
  });
});

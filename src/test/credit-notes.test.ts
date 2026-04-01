import { describe, it, expect } from "vitest";
import { validateCreditApplication } from "@/server/routers/creditNotes";

describe("validateCreditApplication", () => {
  it("rejects if amount > credit note remaining", () => {
    expect(() => validateCreditApplication(150, 100, 200)).toThrow(
      "exceeds credit note remaining",
    );
  });

  it("rejects if amount > invoice balance", () => {
    expect(() => validateCreditApplication(150, 200, 100)).toThrow(
      "exceeds invoice balance",
    );
  });

  it("accepts valid amount within both limits", () => {
    expect(() => validateCreditApplication(50, 100, 100)).not.toThrow();
  });

  it("accepts amount equal to credit note remaining", () => {
    expect(() => validateCreditApplication(100, 100, 200)).not.toThrow();
  });

  it("accepts amount equal to invoice balance", () => {
    expect(() => validateCreditApplication(100, 200, 100)).not.toThrow();
  });

  it("rejects when credit remaining is 0", () => {
    expect(() => validateCreditApplication(50, 0, 200)).toThrow(
      "no remaining balance",
    );
  });

  it("rejects when invoice balance is 0", () => {
    expect(() => validateCreditApplication(50, 200, 0)).toThrow(
      "no outstanding balance",
    );
  });
});

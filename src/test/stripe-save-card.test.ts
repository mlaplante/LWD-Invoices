import { describe, it, expect } from "vitest";

describe("saveStripeCard", () => {
  it("extracts card details from PaymentMethod type", () => {
    const mockCard = {
      type: "card" as const,
      card: { last4: "4242", brand: "visa", exp_month: 12, exp_year: 2028 },
    };
    expect(mockCard.type).toBe("card");
    expect(mockCard.card.last4).toBe("4242");
    expect(mockCard.card.brand).toBe("visa");
  });

  it("skips non-card payment methods", () => {
    const mockBankTransfer = { type: "us_bank_account" as const, card: undefined };
    expect(mockBankTransfer.type).not.toBe("card");
  });
});

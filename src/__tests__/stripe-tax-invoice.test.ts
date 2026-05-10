import { describe, expect, it, vi } from "vitest";
import {
  computeInvoiceTaxViaStripe,
  distributeDiscount,
} from "@/server/services/stripe-tax-invoice";

const ADDR = {
  line1: "1 Test",
  city: "City",
  state: "CA",
  postalCode: "00000",
  country: "US",
};

describe("distributeDiscount", () => {
  const lines = [
    { reference: "a", preDiscountSubtotal: 100 },
    { reference: "b", preDiscountSubtotal: 300 },
  ];

  it("returns originals when discount is null or zero", () => {
    expect(distributeDiscount(lines, null).postDiscount).toEqual([100, 300]);
    expect(distributeDiscount(lines, { type: "fixed", amount: 0 }).postDiscount).toEqual([100, 300]);
  });

  it("applies a percentage discount proportionally", () => {
    const { postDiscount, discountTotal } = distributeDiscount(lines, {
      type: "percentage",
      amount: 10,
    });
    // 10% of 400 = 40; split 100:300 -> 10 from a, 30 from b
    expect(postDiscount).toEqual([90, 270]);
    expect(discountTotal).toBe(40);
  });

  it("applies a fixed discount proportionally and is clamped to subtotal", () => {
    const { postDiscount, discountTotal } = distributeDiscount(lines, {
      type: "fixed",
      amount: 80,
    });
    // 80 / 400 = 20%; lines get 80, 240
    expect(postDiscount).toEqual([80, 240]);
    expect(discountTotal).toBe(80);

    // Discount larger than subtotal is clamped (no negative line amounts)
    const huge = distributeDiscount(lines, { type: "fixed", amount: 1000 });
    expect(huge.discountTotal).toBe(400);
    expect(huge.postDiscount.every((n) => n >= 0)).toBe(true);
  });
});

describe("computeInvoiceTaxViaStripe", () => {
  it("ships post-discount amounts to Stripe and reshapes the response", async () => {
    const stripe = {
      tax: {
        calculations: {
          create: vi.fn().mockResolvedValue({
            id: "taxcalc_123",
            tax_amount_exclusive: 27,
            line_items: {
              data: [
                {
                  reference: "a",
                  amount: 9000,
                  amount_tax: 720,
                  tax_breakdown: [
                    {
                      jurisdiction: { display_name: "California", level: "state" },
                      amount: 720,
                      taxable_amount: 9000,
                      tax_rate_details: { percentage_decimal: "8", tax_type: "sales_tax" },
                      taxability_reason: "standard_rated",
                    },
                  ],
                },
                {
                  reference: "b",
                  amount: 27000,
                  amount_tax: 2160,
                  tax_breakdown: [
                    {
                      jurisdiction: { display_name: "California", level: "state" },
                      amount: 2160,
                      taxable_amount: 27000,
                      tax_rate_details: { percentage_decimal: "8", tax_type: "sales_tax" },
                      taxability_reason: "standard_rated",
                    },
                  ],
                },
              ],
            },
          }),
        },
      },
    };

    const result = await computeInvoiceTaxViaStripe(stripe as never, {
      currency: "usd",
      origin: ADDR,
      destination: ADDR,
      lines: [
        { reference: "a", preDiscountSubtotal: 100 },
        { reference: "b", preDiscountSubtotal: 300 },
      ],
      discount: { type: "percentage", amount: 10 },
    });

    expect(result.calculationId).toBe("taxcalc_123");
    expect(result.discountTotal).toBe(40);
    expect(result.subtotal).toBe(360);
    expect(result.taxTotal).toBeCloseTo(28.8); // 720 + 2160 cents
    expect(result.total).toBeCloseTo(388.8);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].subtotal).toBe(90);
    expect(result.lines[1].subtotal).toBe(270);
    expect(result.lines[0].breakdown[0].jurisdictionDisplay).toBe("California");

    const sentArgs = stripe.tax.calculations.create.mock.calls[0][0];
    expect(sentArgs.line_items[0].amount).toBe(9000); // 90 * 100 cents
    expect(sentArgs.line_items[1].amount).toBe(27000); // 270 * 100
  });
});

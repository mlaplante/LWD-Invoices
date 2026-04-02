import { describe, it, expect } from "vitest";

/**
 * Report helper functions extracted from reports router
 * These functions aggregate and process financial data
 */

interface PaymentByGateway {
  count: number;
  total: number;
  fees: number;
}

interface Payment {
  method: string;
  amount: number;
  gatewayFee: number;
}

interface AggregatedPayments {
  [key: string]: PaymentByGateway;
}

function aggregatePaymentsByGateway(payments: Payment[]): AggregatedPayments {
  const byGateway: AggregatedPayments = {};
  for (const p of payments) {
    const key = p.method;
    if (!byGateway[key]) byGateway[key] = { count: 0, total: 0, fees: 0 };
    byGateway[key].count++;
    byGateway[key].total += p.amount;
    byGateway[key].fees += p.gatewayFee;
  }
  return byGateway;
}

function calculateNetAmount(total: number, fees: number): number {
  return total - fees;
}

function calculateFeePercentage(total: number, fees: number): number {
  if (total === 0) return 0;
  return (fees / total) * 100;
}

function aggregateByKey<T>(
  items: T[],
  getKey: (item: T) => string,
  aggregate: (values: T[]) => number,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    if (!result[key]) {
      result[key] = 0;
    }
  }

  for (const item of items) {
    const key = getKey(item);
    const current = items.filter((i) => getKey(i) === key);
    result[key] = aggregate(current);
  }

  return result;
}

describe("Report Aggregation Helpers", () => {
  describe("aggregatePaymentsByGateway", () => {
    it("returns empty object for no payments", () => {
      const result = aggregatePaymentsByGateway([]);
      expect(result).toEqual({});
    });

    it("aggregates single payment", () => {
      const payments = [
        { method: "stripe", amount: 100, gatewayFee: 2.9 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(result.stripe).toEqual({
        count: 1,
        total: 100,
        fees: 2.9,
      });
    });

    it("aggregates multiple payments from same gateway", () => {
      const payments = [
        { method: "stripe", amount: 100, gatewayFee: 2.9 },
        { method: "stripe", amount: 250, gatewayFee: 7.25 },
        { method: "stripe", amount: 75, gatewayFee: 2.17 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(result.stripe).toEqual({
        count: 3,
        total: 425,
        fees: 12.32,
      });
    });

    it("separates payments by gateway", () => {
      const payments = [
        { method: "stripe", amount: 100, gatewayFee: 2.9 },
        { method: "paypal", amount: 200, gatewayFee: 5.8 },
        { method: "stripe", amount: 75, gatewayFee: 2.17 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(result.stripe?.count).toBe(2);
      expect(result.paypal?.count).toBe(1);
      expect(result.stripe?.total).toBe(175);
      expect(result.paypal?.total).toBe(200);
    });

    it("handles many different gateways", () => {
      const payments = [
        { method: "stripe", amount: 100, gatewayFee: 2.9 },
        { method: "paypal", amount: 200, gatewayFee: 5.8 },
        { method: "square", amount: 150, gatewayFee: 4.5 },
        { method: "apple_pay", amount: 75, gatewayFee: 2.25 },
        { method: "google_pay", amount: 125, gatewayFee: 3.75 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(Object.keys(result)).toHaveLength(5);
      expect(result.square?.total).toBe(150);
      expect(result.apple_pay?.count).toBe(1);
    });

    it("maintains accurate fee calculations across multiple payments", () => {
      const payments = [
        { method: "stripe", amount: 1000, gatewayFee: 29 },
        { method: "stripe", amount: 2000, gatewayFee: 58 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(result.stripe?.total).toBe(3000);
      expect(result.stripe?.fees).toBe(87);
      expect(result.stripe?.count).toBe(2);
    });

    it("handles decimal amounts and fees", () => {
      const payments = [
        { method: "stripe", amount: 123.45, gatewayFee: 3.57 },
        { method: "stripe", amount: 678.90, gatewayFee: 19.69 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(result.stripe?.total).toBeCloseTo(802.35, 2);
      expect(result.stripe?.fees).toBeCloseTo(23.26, 2);
    });

    it("preserves gateway names exactly", () => {
      const payments = [
        { method: "Stripe_Live", amount: 100, gatewayFee: 2.9 },
        { method: "stripe_live", amount: 50, gatewayFee: 1.45 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(result["Stripe_Live"]).toBeDefined();
      expect(result["stripe_live"]).toBeDefined();
      expect(Object.keys(result)).toHaveLength(2);
    });

    it("handles zero amount payments", () => {
      const payments = [
        { method: "stripe", amount: 0, gatewayFee: 0 },
        { method: "stripe", amount: 100, gatewayFee: 2.9 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(result.stripe?.count).toBe(2);
      expect(result.stripe?.total).toBe(100);
    });

    it("handles large numbers", () => {
      const payments = [
        { method: "stripe", amount: 999999.99, gatewayFee: 28999.99 },
        { method: "stripe", amount: 1000000, gatewayFee: 29000 },
      ];
      const result = aggregatePaymentsByGateway(payments);

      expect(result.stripe?.count).toBe(2);
      expect(result.stripe?.total).toBeCloseTo(1999999.99, 2);
      expect(result.stripe?.fees).toBeCloseTo(57999.99, 2);
    });

    it("does not mutate input array", () => {
      const payments = [
        { method: "stripe", amount: 100, gatewayFee: 2.9 },
      ];
      const original = [...payments];

      aggregatePaymentsByGateway(payments);

      expect(payments).toEqual(original);
    });
  });

  describe("calculateNetAmount", () => {
    it("returns zero for zero amounts", () => {
      expect(calculateNetAmount(0, 0)).toBe(0);
    });

    it("calculates net for total without fees", () => {
      expect(calculateNetAmount(1000, 0)).toBe(1000);
    });

    it("calculates net by subtracting fees", () => {
      expect(calculateNetAmount(1000, 30)).toBe(970);
    });

    it("handles decimal values", () => {
      expect(calculateNetAmount(123.45, 3.57)).toBeCloseTo(119.88, 2);
    });

    it("handles fees exceeding total (edge case)", () => {
      expect(calculateNetAmount(100, 150)).toBe(-50);
    });

    it("maintains precision with multiple decimal places", () => {
      expect(calculateNetAmount(999.99, 29.99)).toBeCloseTo(970, 2);
    });

    it("handles very small amounts", () => {
      expect(calculateNetAmount(0.01, 0.001)).toBeCloseTo(0.009, 3);
    });

    it("handles very large amounts", () => {
      expect(calculateNetAmount(1000000, 29000)).toBe(971000);
    });
  });

  describe("calculateFeePercentage", () => {
    it("returns 0 for zero total", () => {
      expect(calculateFeePercentage(0, 0)).toBe(0);
    });

    it("returns 0 when no fees", () => {
      expect(calculateFeePercentage(1000, 0)).toBe(0);
    });

    it("calculates percentage correctly", () => {
      expect(calculateFeePercentage(1000, 30)).toBe(3);
    });

    it("calculates for standard Stripe rate", () => {
      expect(calculateFeePercentage(1000, 29)).toBeCloseTo(2.9, 1);
    });

    it("calculates for standard PayPal rate", () => {
      expect(calculateFeePercentage(1000, 35)).toBeCloseTo(3.5, 1);
    });

    it("handles decimal percentages", () => {
      expect(calculateFeePercentage(100, 2.5)).toBeCloseTo(2.5, 1);
    });

    it("handles high fee percentages", () => {
      expect(calculateFeePercentage(100, 50)).toBe(50);
    });

    it("handles very small percentages", () => {
      expect(calculateFeePercentage(1000000, 100)).toBeCloseTo(0.01, 2);
    });

    it("maintains precision with many decimals", () => {
      const result = calculateFeePercentage(333.33, 10);
      expect(result).toBeCloseTo(3.0003, 3);
    });

    it("handles fees exceeding total", () => {
      expect(calculateFeePercentage(100, 150)).toBe(150);
    });
  });

  describe("aggregateByKey", () => {
    interface Item {
      category: string;
      value: number;
    }

    it("returns empty object for empty array", () => {
      const result = aggregateByKey<Item>([], () => "", () => 0);
      expect(result).toEqual({});
    });

    it("aggregates single item", () => {
      const items: Item[] = [{ category: "A", value: 10 }];
      const result = aggregateByKey(items, (i) => i.category, (values) =>
        values.reduce((sum, v) => sum + v.value, 0),
      );

      expect(result).toEqual({ A: 10 });
    });

    it("aggregates multiple items in single category", () => {
      const items: Item[] = [
        { category: "A", value: 10 },
        { category: "A", value: 20 },
        { category: "A", value: 30 },
      ];
      const result = aggregateByKey(items, (i) => i.category, (values) =>
        values.reduce((sum, v) => sum + v.value, 0),
      );

      expect(result).toEqual({ A: 60 });
    });

    it("aggregates items across multiple categories", () => {
      const items: Item[] = [
        { category: "A", value: 10 },
        { category: "B", value: 20 },
        { category: "A", value: 30 },
        { category: "C", value: 15 },
        { category: "B", value: 25 },
      ];
      const result = aggregateByKey(items, (i) => i.category, (values) =>
        values.reduce((sum, v) => sum + v.value, 0),
      );

      expect(result).toEqual({
        A: 40,
        B: 45,
        C: 15,
      });
    });

    it("supports custom aggregation functions", () => {
      const items: Item[] = [
        { category: "A", value: 10 },
        { category: "A", value: 20 },
      ];
      const result = aggregateByKey(items, (i) => i.category, (values) =>
        values.length,
      );

      expect(result).toEqual({ A: 2 });
    });

    it("handles string keys with special characters", () => {
      const items: Item[] = [
        { category: "A-1", value: 10 },
        { category: "A-1", value: 20 },
        { category: "B_2", value: 15 },
      ];
      const result = aggregateByKey(items, (i) => i.category, (values) =>
        values.reduce((sum, v) => sum + v.value, 0),
      );

      expect(result["A-1"]).toBe(30);
      expect(result["B_2"]).toBe(15);
    });
  });

  describe("Financial Calculation Scenarios", () => {
    it("calculates net payment after Stripe fees", () => {
      const amount = 1000;
      const fee = calculateFeePercentage(amount, 29);
      const netAmount = calculateNetAmount(amount, 29);

      expect(fee).toBeCloseTo(2.9, 1);
      expect(netAmount).toBe(971);
    });

    it("aggregates multi-gateway payments and calculates totals", () => {
      const payments = [
        { method: "stripe", amount: 1000, gatewayFee: 29 },
        { method: "paypal", amount: 500, gatewayFee: 17.5 },
        { method: "stripe", amount: 2000, gatewayFee: 58 },
      ];

      const aggregated = aggregatePaymentsByGateway(payments);
      const stripeNet = calculateNetAmount(
        aggregated.stripe?.total ?? 0,
        aggregated.stripe?.fees ?? 0,
      );
      const paypalNet = calculateNetAmount(
        aggregated.paypal?.total ?? 0,
        aggregated.paypal?.fees ?? 0,
      );

      expect(stripeNet).toBe(2913);
      expect(paypalNet).toBeCloseTo(482.5, 1);
      expect(aggregated.stripe?.count).toBe(2);
      expect(aggregated.paypal?.count).toBe(1);
    });

    it("compares fee percentages across gateways", () => {
      const stripeFee = calculateFeePercentage(1000, 29);
      const paypalFee = calculateFeePercentage(1000, 35);
      const squareFee = calculateFeePercentage(1000, 27.5);

      expect(stripeFee).toBeCloseTo(2.9, 1);
      expect(paypalFee).toBeCloseTo(3.5, 1);
      expect(squareFee).toBeCloseTo(2.75, 2);
      expect(stripeFee).toBeLessThan(paypalFee);
      expect(squareFee).toBeLessThan(stripeFee);
    });
  });
});

import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/lib/format";

describe("formatCurrency", () => {
  it("adds thousands separators", () => {
    expect(formatCurrency(1234567, "$", "before")).toBe("$1,234,567.00");
  });

  it("respects symbol position", () => {
    expect(formatCurrency(99.5, "€", "after")).toBe("99.50€");
    expect(formatCurrency(99.5, "€", "before")).toBe("€99.50");
  });

  it("defaults to 2 decimals without a code", () => {
    expect(formatCurrency(10, "$", "before")).toBe("$10.00");
  });

  it("uses 0 decimals for zero-decimal currencies like JPY", () => {
    expect(formatCurrency(1234.6, "¥", "before", "JPY")).toBe("¥1,235");
  });

  it("uses 3 decimals for three-decimal currencies like BHD", () => {
    expect(formatCurrency(1234.5678, "BD", "before", "BHD")).toBe("BD1,234.568");
  });

  it("keeps 2 decimals for standard currencies with a code", () => {
    expect(formatCurrency(1234.5, "$", "before", "USD")).toBe("$1,234.50");
  });

  it("falls back to 2 decimals for unknown codes", () => {
    expect(formatCurrency(10, "?", "before", "NOT_A_CODE")).toBe("?10.00");
  });

  it("handles Prisma Decimal-like objects", () => {
    expect(formatCurrency({ toNumber: () => 42.5 }, "$", "before")).toBe("$42.50");
  });

  it("handles numeric strings", () => {
    expect(formatCurrency("1999.99", "$", "before")).toBe("$1,999.99");
  });

  it("handles negative amounts", () => {
    expect(formatCurrency(-1234.5, "$", "before")).toBe("$-1,234.50");
  });
});

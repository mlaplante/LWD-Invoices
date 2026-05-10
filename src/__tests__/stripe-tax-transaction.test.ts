import { describe, expect, it, vi } from "vitest";
import {
  promoteStripeTaxCalculation,
  reverseStripeTaxTransaction,
} from "@/server/services/stripe-tax-transaction";

function makeStripe(create: ReturnType<typeof vi.fn>) {
  return { tax: { transactions: { createFromCalculation: create } } } as never;
}

function makeDb(opts: {
  invoice: {
    stripeTaxCalculationId: string | null;
    stripeTaxTransactionId: string | null;
  } | null;
}) {
  return {
    invoice: {
      findUnique: vi.fn().mockResolvedValue(opts.invoice),
      update: vi.fn().mockResolvedValue(undefined),
    },
  } as never;
}

describe("promoteStripeTaxCalculation", () => {
  it("creates a Tax Transaction and persists the id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "txn_abc" });
    const stripe = makeStripe(create);
    const db = makeDb({
      invoice: { stripeTaxCalculationId: "calc_xyz", stripeTaxTransactionId: null },
    });

    const result = await promoteStripeTaxCalculation({
      db,
      stripe,
      invoiceId: "inv_1",
      reference: "INV-0001",
    });

    expect(result.transactionId).toBe("txn_abc");
    expect(create).toHaveBeenCalledWith({
      calculation: "calc_xyz",
      reference: "INV-0001",
    });
    // @ts-expect-error mock helper
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: { stripeTaxTransactionId: "txn_abc" },
    });
  });

  it("is idempotent when transaction already exists", async () => {
    const create = vi.fn();
    const stripe = makeStripe(create);
    const db = makeDb({
      invoice: { stripeTaxCalculationId: "calc_xyz", stripeTaxTransactionId: "txn_existing" },
    });

    const result = await promoteStripeTaxCalculation({
      db,
      stripe,
      invoiceId: "inv_1",
      reference: "INV-0001",
    });

    expect(result.transactionId).toBe("txn_existing");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns null when no calculation exists (legacy invoice)", async () => {
    const create = vi.fn();
    const stripe = makeStripe(create);
    const db = makeDb({
      invoice: { stripeTaxCalculationId: null, stripeTaxTransactionId: null },
    });

    const result = await promoteStripeTaxCalculation({
      db,
      stripe,
      invoiceId: "inv_1",
      reference: "INV-0001",
    });

    expect(result.transactionId).toBeNull();
    expect(result.reason).toBe("no calculation to promote");
    expect(create).not.toHaveBeenCalled();
  });

  it("swallows Stripe errors (e.g. expired calculation) without throwing", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Calculation has expired"));
    const stripe = makeStripe(create);
    const db = makeDb({
      invoice: { stripeTaxCalculationId: "calc_old", stripeTaxTransactionId: null },
    });

    const result = await promoteStripeTaxCalculation({
      db,
      stripe,
      invoiceId: "inv_1",
      reference: "INV-0001",
    });

    expect(result.transactionId).toBeNull();
    expect(result.reason).toContain("expired");
  });
});

describe("reverseStripeTaxTransaction", () => {
  function makeReverseStripe(create: ReturnType<typeof vi.fn>) {
    return { tax: { transactions: { createReversal: create } } } as never;
  }
  function makeReverseDb(opts: {
    creditNote: { stripeTaxTransactionId: string | null } | null;
  }) {
    return {
      invoice: {
        findUnique: vi.fn().mockResolvedValue(opts.creditNote),
        update: vi.fn().mockResolvedValue(undefined),
      },
    } as never;
  }

  it("issues a reversal and persists the new transaction id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "txn_rev_1" });
    const stripe = makeReverseStripe(create);
    const db = makeReverseDb({ creditNote: { stripeTaxTransactionId: null } });

    const result = await reverseStripeTaxTransaction({
      db,
      stripe,
      creditNoteId: "cn_1",
      originalTransactionId: "txn_orig",
      reference: "CN-0001",
    });

    expect(result.transactionId).toBe("txn_rev_1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "full",
        original_transaction: "txn_orig",
        reference: "CN-0001",
      }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining("cn-reverse-cn_1") }),
    );
    // @ts-expect-error mock helper
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: "cn_1" },
      data: { stripeTaxTransactionId: "txn_rev_1" },
    });
  });

  it("is idempotent when the credit note already has a reversal id", async () => {
    const create = vi.fn();
    const stripe = makeReverseStripe(create);
    const db = makeReverseDb({
      creditNote: { stripeTaxTransactionId: "txn_rev_existing" },
    });

    const result = await reverseStripeTaxTransaction({
      db,
      stripe,
      creditNoteId: "cn_1",
      originalTransactionId: "txn_orig",
      reference: "CN-0001",
    });

    expect(result.transactionId).toBe("txn_rev_existing");
    expect(create).not.toHaveBeenCalled();
  });

  it("swallows Stripe errors without throwing", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Original transaction not found"));
    const stripe = makeReverseStripe(create);
    const db = makeReverseDb({ creditNote: { stripeTaxTransactionId: null } });

    const result = await reverseStripeTaxTransaction({
      db,
      stripe,
      creditNoteId: "cn_1",
      originalTransactionId: "txn_missing",
      reference: "CN-0001",
    });

    expect(result.transactionId).toBeNull();
    expect(result.reason).toContain("not found");
  });
});

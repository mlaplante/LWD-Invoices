import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildExpenseDraftFromReceipt } from "@/server/services/expense-receipt-draft";
import { createMockPrismaClient } from "./mocks/prisma";

type MockDb = ReturnType<typeof createMockPrismaClient> & {
  expenseCategory: { findMany: ReturnType<typeof vi.fn> };
  expenseSupplier: { findFirst: ReturnType<typeof vi.fn> };
  expense: { create: ReturnType<typeof vi.fn> };
};

vi.mock("@/server/services/receipt-ocr", () => ({
  parseReceiptWithOCR: vi.fn(),
}));

const { parseReceiptWithOCR } = await import("@/server/services/receipt-ocr");
const mockParseReceiptWithOCR = vi.mocked(parseReceiptWithOCR);

function category(id: string, name: string) {
  return { id, name, organizationId: "org_1", createdAt: new Date(), updatedAt: new Date() };
}

function supplier(id: string, name: string) {
  return { id, name, organizationId: "org_1", createdAt: new Date(), updatedAt: new Date() };
}

describe("expense receipt draft builder", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockPrismaClient() as MockDb;
    db.expenseCategory.findMany.mockResolvedValue([
      category("cat_meals", "Meals"),
      category("cat_software", "Software"),
      category("cat_other", "Other"),
    ]);
    db.expenseSupplier.findFirst.mockResolvedValue(null);
  });

  it("turns a clear receipt image into a reviewable expense draft without creating an expense", async () => {
    mockParseReceiptWithOCR.mockResolvedValue({
      vendor: "GitHub",
      amount: 42.99,
      tax: 3.44,
      currency: "USD",
      date: "2026-03-15",
      category: "Software",
      confidence: 0.94,
      lineItems: [{ description: "Team subscription", quantity: 1, unitPrice: 42.99, total: 42.99 }],
      rawResponse: { provider: "test" },
    });
    db.expenseSupplier.findFirst.mockResolvedValue(supplier("sup_github", "GitHub"));

    const draft = await buildExpenseDraftFromReceipt(db, "org_1", {
      file: Buffer.from("fake-image"),
      mimeType: "image/png",
      fileName: "receipt.png",
      projectId: "proj_1",
    });

    expect(draft.draft).toMatchObject({
      projectId: "proj_1",
      name: "GitHub",
      rate: 42.99,
      paidAt: "2026-03-15",
      categoryId: "cat_software",
      supplierId: "sup_github",
      ocrConfidence: 0.94,
    });
    expect(draft.extracted).toMatchObject({ vendor: "GitHub", currency: "USD", tax: 3.44 });
    expect(draft.warnings).toEqual([]);
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  it("handles a PDF receipt happy path through the OCR abstraction", async () => {
    mockParseReceiptWithOCR.mockResolvedValue({
      vendor: "Delta Airlines",
      amount: 199.5,
      tax: null,
      currency: "USD",
      date: "2026-04-02",
      category: "Travel",
      confidence: 0.87,
      lineItems: [],
      rawResponse: {},
    });
    db.expenseCategory.findMany.mockResolvedValue([
      category("cat_travel", "Travel"),
      category("cat_other", "Other"),
    ]);

    const draft = await buildExpenseDraftFromReceipt(db, "org_1", {
      file: Buffer.from("%PDF-fake"),
      mimeType: "application/pdf",
      fileName: "receipt.pdf",
    });

    expect(mockParseReceiptWithOCR).toHaveBeenCalledWith(Buffer.from("%PDF-fake"), "application/pdf", {
      fileName: "receipt.pdf",
    });
    expect(draft.draft.categoryId).toBe("cat_travel");
    expect(draft.draft.rate).toBe(199.5);
  });

  it("adds actionable warnings and safe defaults when fields are missing", async () => {
    mockParseReceiptWithOCR.mockResolvedValue({
      vendor: null,
      amount: null,
      tax: null,
      currency: null,
      date: null,
      category: null,
      confidence: 0.72,
      lineItems: [],
      rawResponse: {},
    });

    const draft = await buildExpenseDraftFromReceipt(db, "org_1", {
      file: Buffer.from("blurry"),
      mimeType: "image/jpeg",
      fileName: "blurry.jpg",
    });

    expect(draft.draft).toMatchObject({
      name: "Receipt expense",
      rate: 0,
      categoryId: "cat_other",
    });
    expect(draft.warnings).toContain("Vendor could not be read; review the expense name before saving.");
    expect(draft.warnings).toContain("Total amount could not be read; enter the amount before saving.");
    expect(draft.warnings).toContain("Receipt date could not be read; add the date if needed.");
  });

  it("warns on low confidence extraction", async () => {
    mockParseReceiptWithOCR.mockResolvedValue({
      vendor: "Cafe Blur",
      amount: 12.5,
      tax: 0.8,
      currency: "CAD",
      date: "2026-05-10",
      category: "Meals",
      confidence: 0.41,
      lineItems: [],
      rawResponse: {},
    });

    const draft = await buildExpenseDraftFromReceipt(db, "org_1", {
      file: Buffer.from("low-confidence"),
      mimeType: "image/webp",
      fileName: "low.webp",
    });

    expect(draft.warnings).toContain("Receipt scan confidence is low; review every field before saving.");
  });

  it("uses keyword category selection with an Other fallback", async () => {
    mockParseReceiptWithOCR.mockResolvedValue({
      vendor: "Staples",
      amount: 18.25,
      tax: null,
      currency: "USD",
      date: null,
      category: "paper and pens",
      confidence: 0.9,
      lineItems: [{ description: "printer paper", quantity: 1, unitPrice: 18.25, total: 18.25 }],
      rawResponse: {},
    });
    db.expenseCategory.findMany.mockResolvedValue([
      category("cat_office", "Office Supplies"),
      category("cat_other", "Other"),
    ]);

    const draft = await buildExpenseDraftFromReceipt(db, "org_1", {
      file: Buffer.from("office"),
      mimeType: "image/png",
      fileName: "office.png",
    });

    expect(draft.draft.categoryId).toBe("cat_office");
  });
});

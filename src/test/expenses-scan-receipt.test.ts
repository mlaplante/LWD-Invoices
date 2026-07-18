import { describe, it, expect, vi, beforeEach } from "vitest";
import { expensesRouter } from "@/server/routers/expenses";
import { createMockContext } from "./mocks/trpc-context";
import type { MockTRPCContext } from "./mocks/trpc-context";

vi.mock("@/server/services/expense-receipt-draft", () => ({
  buildExpenseDraftFromReceipt: vi.fn(),
}));

vi.mock("@/server/services/receipt-ocr", () => ({
  resolveProvider: vi.fn(() => "anthropic"),
}));

vi.mock("@/server/services/recurring-expense-generator", () => ({
  generateExpensesForRecurring: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/tax-calculator", () => ({
  calculateLineTotals: vi.fn(),
  calculateInvoiceTotals: vi.fn(),
  getOrgTaxMap: vi.fn().mockResolvedValue(new Map()),
}));

const { buildExpenseDraftFromReceipt } = await import("@/server/services/expense-receipt-draft");
const { resolveProvider } = await import("@/server/services/receipt-ocr");
const mockBuildExpenseDraftFromReceipt = vi.mocked(buildExpenseDraftFromReceipt);

describe("expenses.scanReceipt", () => {
  let ctx: MockTRPCContext;
  let caller: ReturnType<typeof expensesRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    caller = expensesRouter.createCaller(ctx);
  });

  it("decodes uploaded image data and returns a reviewable draft", async () => {
    mockBuildExpenseDraftFromReceipt.mockResolvedValue({
      draft: {
        projectId: "proj_1",
        name: "GitHub",
        qty: 1,
        rate: 42.99,
        paidAt: "2026-03-15",
        categoryId: "cat_software",
        ocrRawResult: { provider: "test" },
        ocrConfidence: 0.94,
      },
      extracted: {
        vendor: "GitHub",
        amount: 42.99,
        tax: 3.44,
        currency: "USD",
        date: "2026-03-15",
        category: "Software",
        confidence: 0.94,
        lineItems: [],
      },
      warnings: [],
    });

    const result = await caller.scanReceipt({
      projectId: "proj_1",
      fileName: "receipt.png",
      mimeType: "image/png",
      dataBase64: `data:image/png;base64,${Buffer.from("fake-image").toString("base64")}`,
    });

    expect(result.unavailable).toBe(false);
    if (result.unavailable) throw new Error("Receipt scanning should be available");
    expect(result.draft.name).toBe("GitHub");
    expect(ctx.db.expense.create).not.toHaveBeenCalled();
    expect(mockBuildExpenseDraftFromReceipt).toHaveBeenCalledWith(ctx.db, "test-org-123", {
      file: Buffer.from("fake-image"),
      mimeType: "image/png",
      fileName: "receipt.png",
      projectId: "proj_1",
    });
  });

  it("accepts PDFs for the OpenAI extraction pipeline", async () => {
    mockBuildExpenseDraftFromReceipt.mockResolvedValue({
      draft: {
        name: "Receipt expense",
        qty: 1,
        rate: 0,
        ocrRawResult: {},
        ocrConfidence: 0,
      },
      extracted: {
        vendor: null,
        amount: null,
        tax: null,
        currency: null,
        date: null,
        category: null,
        confidence: 0,
        lineItems: [],
      },
      warnings: ["Total amount could not be read; enter the amount before saving."],
    });

    await caller.scanReceipt({
      fileName: "receipt.pdf",
      mimeType: "application/pdf",
      dataBase64: Buffer.from("%PDF-fake").toString("base64"),
    });

    expect(mockBuildExpenseDraftFromReceipt).toHaveBeenCalledWith(ctx.db, "test-org-123", {
      file: Buffer.from("%PDF-fake"),
      mimeType: "application/pdf",
      fileName: "receipt.pdf",
      projectId: undefined,
    });
  });

  it("returns an informational unavailable result without an AI provider", async () => {
    vi.mocked(resolveProvider).mockReturnValueOnce(null);

    await expect(caller.scanReceipt({
      fileName: "receipt.png",
      mimeType: "image/png",
      dataBase64: Buffer.from("fake-image").toString("base64"),
    })).resolves.toEqual({
      unavailable: true,
      message: "Receipt scanning requires an AI provider key (Settings → AI). Enter the expense details manually.",
    });
    expect(mockBuildExpenseDraftFromReceipt).not.toHaveBeenCalled();
  });

  it("rejects callers without an elevated role", async () => {
    const memberCtx = createMockContext({ userRole: "MEMBER" });
    const memberCaller = expensesRouter.createCaller(memberCtx);

    await expect(
      memberCaller.scanReceipt({
        fileName: "receipt.png",
        mimeType: "image/png",
        dataBase64: Buffer.from("fake-image").toString("base64"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockBuildExpenseDraftFromReceipt).not.toHaveBeenCalled();
  });
});

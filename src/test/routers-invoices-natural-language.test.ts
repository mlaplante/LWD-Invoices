import { describe, expect, it, beforeEach, vi } from "vitest";
import { invoicesRouter, draftFromPromptLimiter } from "@/server/routers/invoices";
import { extractNaturalLanguageInvoiceWithOpenAI } from "@/server/services/natural-language-invoice";
import { createMockContext, type MockTRPCContext } from "./mocks/trpc-context";
import { InvoiceStatus } from "@/generated/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

vi.mock("@/server/services/natural-language-invoice", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/natural-language-invoice")>(
    "@/server/services/natural-language-invoice",
  );
  return {
    ...actual,
    extractNaturalLanguageInvoiceWithOpenAI: vi.fn().mockResolvedValue({
      clientName: "Acme",
      lines: [
        { name: "Design", quantity: 8, unit: "hours", rate: 120 },
        { name: "Figma license", quantity: 1 },
      ],
      notes: "Please confirm before sending.",
      taxNames: [],
      ambiguities: [],
      confidence: 0.9,
    }),
  };
});

describe("Invoices Router natural-language draft", () => {
  let ctx: MockTRPCContext;
  let caller: ReturnType<typeof invoicesRouter.createCaller>;

  beforeEach(() => {
    // The limiter holds module-scope state — reset it so call order between
    // tests can't trip (or mask) the rate limit.
    draftFromPromptLimiter.clear();
    vi.mocked(extractNaturalLanguageInvoiceWithOpenAI).mockClear();
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
    ctx.db.client.findMany.mockResolvedValue([
      { id: "client_acme", name: "Acme" },
    ]);
    ctx.db.item.findMany.mockResolvedValue([
      { id: "item_design", name: "Design", description: "Product design", rate: new Decimal("120"), unit: "hour" },
      { id: "item_figma", name: "Figma license", description: "Monthly seat", rate: new Decimal("15"), unit: "license" },
    ]);
    ctx.db.tax.findMany.mockResolvedValue([]);
    ctx.db.currency.findMany.mockResolvedValue([
      { id: "usd", code: "USD", symbol: "$", symbolPosition: "before", isDefault: true },
    ]);
  });

  it("returns a reviewable draft payload and does not persist an invoice", async () => {
    const draft = await caller.draftFromPrompt({
      prompt: "Bill Acme 8 hrs design at $120 plus the Figma license",
    });

    expect(draft.status).toBe(InvoiceStatus.DRAFT);
    expect(draft.requiresReview).toBe(true);
    expect(draft.clientId).toBe("client_acme");
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0]).toMatchObject({ sourceTable: "items", sourceId: "item_design" });
    expect(draft.lines[1]).toMatchObject({ sourceTable: "items", sourceId: "item_figma", rate: 15 });
    expect(ctx.db.invoice.create).not.toHaveBeenCalled();
  });

  it("rate-limits repeated drafting and skips the OpenAI call when limited", async () => {
    const extractSpy = vi.mocked(extractNaturalLanguageInvoiceWithOpenAI);

    // The limiter allows 10 drafts per minute per org; exhaust the window.
    for (let i = 0; i < 10; i++) {
      await caller.draftFromPrompt({ prompt: "Bill Acme for design work" });
    }
    expect(extractSpy).toHaveBeenCalledTimes(10);

    // The 11th call within the window must be rejected before the expensive
    // OpenAI call runs — that's the whole point of the limit.
    await expect(
      caller.draftFromPrompt({ prompt: "Bill Acme for design work" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(extractSpy).toHaveBeenCalledTimes(10);
  });
});

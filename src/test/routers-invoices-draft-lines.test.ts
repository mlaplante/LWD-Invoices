import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { invoicesRouter } from "@/server/routers/invoices";
import { invoiceLinesAllNamed } from "@/server/services/invoice-send";
import { createMockContext } from "./mocks/trpc-context";

const emptyNameLine = {
  sort: 0,
  lineType: "STANDARD" as const,
  name: "",
  qty: 1,
  rate: 100,
  discount: 0,
  discountIsPercentage: false,
  taxIds: [] as string[],
};

describe("draft-lenient line names", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof invoicesRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  it("invoiceLinesAllNamed is false for blank or whitespace names", () => {
    expect(invoiceLinesAllNamed([{ name: "Design" }])).toBe(true);
    expect(invoiceLinesAllNamed([{ name: "" }])).toBe(false);
    expect(invoiceLinesAllNamed([{ name: "   " }])).toBe(false);
    expect(invoiceLinesAllNamed([])).toBe(true);
  });

  it("update rejects unnamed lines when the stored invoice is SENT", async () => {
    ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
    ctx.db.invoice.findUnique.mockResolvedValue({ status: "SENT" });

    await expect(
      caller.update({
        id: "inv_1",
        currencyId: "cur_1",
        clientId: undefined,
        lines: [emptyNameLine],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Guard must fire before any tax work touches the DB further.
    expect(ctx.db.invoiceLine.deleteMany).not.toHaveBeenCalled();
    // Org-scoping: the status lookup must be tenant-filtered (Non-Negotiable #1).
    expect(ctx.db.invoice.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "test-org-123" }),
      }),
    );
  });
});

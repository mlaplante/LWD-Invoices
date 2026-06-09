import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the money/tax services so the test exercises the procedure's own logic,
// not the tax engine (which has its own tests).
vi.mock("@/server/lib/tax-helpers", () => ({ getOrgTaxMap: vi.fn(async () => ({})) }));
vi.mock("@/server/services/invoice-tax-resolver", () => ({
  resolveInvoiceTax: vi.fn(async () => ({
    invoice: { subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100, stripeTaxCalculationId: null },
    lines: [{ subtotal: 100, taxTotal: 0, total: 100, legacyTaxBreakdown: [], stripeTaxBreakdown: [] }],
  })),
}));
vi.mock("@/server/services/invoice-numbering", () => ({ generateInvoiceNumber: vi.fn(async () => "EST-001") }));
vi.mock("@/lib/portal-session", () => ({ generatePortalToken: vi.fn(() => "tok_test") }));

import { proposalsRouter } from "@/server/routers/proposals";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

const SECTIONS = [{ key: "scope", title: "Scope", content: "Build it." }];

describe("proposals.createFromWizard", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = proposalsRouter.createCaller(ctx);
    ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123", stripeTaxEnabled: false });
    ctx.db.currency.findFirst.mockResolvedValue({ id: "cur1", isDefault: true });
    ctx.db.invoice.create.mockResolvedValue({ id: "inv-new" });
    ctx.db.proposalContent.create.mockResolvedValue({ id: "pc-new" });
  });

  it("rejects a client from another org", async () => {
    ctx.db.client.findFirst.mockResolvedValue(null); // assertInOrg → NOT_FOUND
    await expect(
      caller.createFromWizard({ clientId: "foreign", sections: SECTIONS, lineItems: [] }),
    ).rejects.toThrow(TRPCError);
  });

  it("throws BAD_REQUEST when the org has no currency", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "c1", organizationId: "test-org-123" });
    ctx.db.currency.findFirst.mockResolvedValue(null);
    await expect(
      caller.createFromWizard({ clientId: "c1", sections: SECTIONS, lineItems: [] }),
    ).rejects.toThrow("No currency configured");
  });

  it("creates an org-scoped ESTIMATE + ProposalContent and returns the invoice id", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "c1", organizationId: "test-org-123" });
    const res = await caller.createFromWizard({
      clientId: "c1",
      sections: SECTIONS,
      lineItems: [{ name: "Design", qty: 2, rate: 50, sourceId: "item1" }],
    });
    expect(res).toEqual({ invoiceId: "inv-new" });

    const invData = ctx.db.invoice.create.mock.calls[0][0].data;
    expect(invData.type).toBe("ESTIMATE");
    expect(invData.status).toBe("DRAFT");
    expect(invData.organizationId).toBe("test-org-123");

    const pcData = ctx.db.proposalContent.create.mock.calls[0][0].data;
    expect(pcData.invoiceId).toBe("inv-new");
    expect(pcData.organizationId).toBe("test-org-123");
    expect(pcData.sections).toEqual(SECTIONS);
  });
});

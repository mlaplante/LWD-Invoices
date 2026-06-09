import { describe, it, expect, beforeEach } from "vitest";
import { proposalsRouter } from "@/server/routers/proposals";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("proposals.generate — multi-tenant isolation", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = proposalsRouter.createCaller(ctx);
  });

  it("scopes the estimate lookup to the caller's org and 404s another org's estimate", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue(null);
    await expect(caller.generate({ invoiceId: "other-org-estimate" })).rejects.toThrow(TRPCError);
    const where = ctx.db.invoice.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
    expect(where.type).toBe("ESTIMATE");
  });

  it("scopes template, past-proposal, and item context to the caller's org", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "est1",
      client: { name: "Acme", projects: [] },
    });
    ctx.db.proposalTemplate.findFirst.mockResolvedValue({ sections: [] });
    ctx.db.proposalContent.findMany.mockResolvedValue([]);
    ctx.db.item.findMany.mockResolvedValue([]);

    // GEMINI_API_KEY is unset in test env, so generateProposal returns null
    // and generate returns { draft: null } — still exercises every org-scoped query.
    const result = await caller.generate({ invoiceId: "est1" });
    expect(result).toEqual({ draft: null });

    expect(ctx.db.proposalTemplate.findFirst.mock.calls[0][0].where.organizationId).toBe(
      "test-org-123",
    );
    expect(ctx.db.proposalContent.findMany.mock.calls[0][0].where.organizationId).toBe(
      "test-org-123",
    );
    expect(ctx.db.item.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});

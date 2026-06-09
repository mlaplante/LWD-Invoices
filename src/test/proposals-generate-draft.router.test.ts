import { describe, it, expect, beforeEach } from "vitest";
import { proposalsRouter } from "@/server/routers/proposals";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("proposals.generateDraft — client-based AI draft", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = proposalsRouter.createCaller(ctx);
  });

  it("404s a client that belongs to another org", async () => {
    ctx.db.client.findFirst.mockResolvedValue(null);
    await expect(caller.generateDraft({ clientId: "other-org-client" })).rejects.toThrow(TRPCError);
    const where = ctx.db.client.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
  });

  it("scopes template, past-proposal, and item context to the caller's org and returns a draft", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "c1", name: "Acme" });
    ctx.db.proposalTemplate.findFirst.mockResolvedValue({ sections: [] });
    ctx.db.proposalContent.findMany.mockResolvedValue([]);
    ctx.db.item.findMany.mockResolvedValue([]);

    // GEMINI_API_KEY is unset in test env → generateProposal returns null → { draft: null }.
    const result = await caller.generateDraft({ clientId: "c1" });
    expect(result).toEqual({ draft: null });

    expect(ctx.db.proposalTemplate.findFirst.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.proposalContent.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.item.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });

  it("validates a supplied project belongs to the client and org", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "c1", name: "Acme" });
    ctx.db.project.findFirst.mockResolvedValue(null);
    await expect(caller.generateDraft({ clientId: "c1", projectId: "p-foreign" })).rejects.toThrow(TRPCError);
    const where = ctx.db.project.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
    expect(where.clientId).toBe("c1");
  });
});

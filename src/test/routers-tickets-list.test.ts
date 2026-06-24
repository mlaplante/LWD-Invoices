import { describe, it, expect, beforeEach } from "vitest";
import { ticketsRouter } from "@/server/routers/tickets";
import { createMockContext } from "./mocks/trpc-context";

describe("tickets.list — cursor pagination", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof ticketsRouter.createCaller>;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123"
    caller = ticketsRouter.createCaller(ctx);
  });

  const row = (id: string) => ({
    id, number: 1, subject: "s", status: "OPEN", priority: "NORMAL",
    createdAt: new Date(), client: { id: "c1", name: "Acme" },
  });

  it("returns no nextCursor when the page is not full", async () => {
    ctx.db.ticket.findMany.mockResolvedValue([row("t1"), row("t2")]);
    const out = await caller.list({ limit: 50 });
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBeUndefined();
    // scoped to the caller's org, and asks for limit + 1 to detect overflow
    const args = ctx.db.ticket.findMany.mock.calls[0][0];
    expect(args.where.organizationId).toBe("test-org-123");
    expect(args.take).toBe(51);
  });

  it("pops the extra row and returns its id as nextCursor when full", async () => {
    // limit 2 → procedure fetches 3; the 3rd signals there's another page.
    ctx.db.ticket.findMany.mockResolvedValue([row("t1"), row("t2"), row("t3")]);
    const out = await caller.list({ limit: 2 });
    expect(out.items.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(out.nextCursor).toBe("t3");
  });

  it("passes cursor + skip when a cursor is supplied", async () => {
    ctx.db.ticket.findMany.mockResolvedValue([]);
    await caller.list({ limit: 50, cursor: "t9" });
    const args = ctx.db.ticket.findMany.mock.calls[0][0];
    expect(args.cursor).toEqual({ id: "t9" });
    expect(args.skip).toBe(1);
  });
});

describe("tickets.summary", () => {
  it("returns org-scoped total/open/urgent counts", async () => {
    const ctx = createMockContext();
    ctx.db.ticket.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(4) // open
      .mockResolvedValueOnce(2); // urgent
    const out = await ticketsRouter.createCaller(ctx).summary();
    expect(out).toEqual({ total: 10, open: 4, urgent: 2 });
    expect(ctx.db.ticket.count.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});

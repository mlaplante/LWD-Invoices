import { describe, it, expect, beforeEach, vi } from "vitest";
import { logAudit } from "@/server/services/audit";
import { ticketsRouter } from "@/server/routers/tickets";
import { createMockContext } from "./mocks/trpc-context";

vi.mock("@/server/services/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

describe("tickets audit logging", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof ticketsRouter.createCaller>;
  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    caller = ticketsRouter.createCaller(ctx);
  });

  it("logs CREATED with entityType Ticket on create", async () => {
    // tickets.create requires subject + body; no clientId so assertInOrg is skipped
    ctx.db.ticket.findFirst.mockResolvedValue(null); // lastTicket → number = 1
    ctx.db.ticket.create.mockResolvedValue({ id: "tkt_1", number: 1, subject: "Bug" });

    await caller.create({ subject: "Bug", body: "x" });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATED",
        entityType: "Ticket",
        entityId: "tkt_1",
        organizationId: "test-org-123",
      }),
    );
  });

  it("logs STATUS_CHANGED on updateStatus", async () => {
    // updateStatus uses updateMany; mock it to return count: 1
    ctx.db.ticket.updateMany.mockResolvedValue({ count: 1 });

    await caller.updateStatus({ id: "tkt_1", status: "CLOSED" as never });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "STATUS_CHANGED",
        entityType: "Ticket",
        entityId: "tkt_1",
      }),
    );
  });
});

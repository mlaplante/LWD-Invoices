import { describe, it, expect, beforeEach } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceType } from "@/generated/prisma";

describe("invoices.createChangeOrder", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  it("rejects a project from another tenant", async () => {
    ctx.db.project.findFirst.mockResolvedValue(null); // assertInOrg → NOT_FOUND
    await expect(
      caller.createChangeOrder({
        projectId: "proj_other",
        lines: [{ sort: 0, name: "Extra page", qty: 1, rate: 500, taxIds: [] }],
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("creates an ESTIMATE flagged as a change order, inheriting client + currency from the project", async () => {
    ctx.db.project.findFirst.mockResolvedValue({
      id: "proj_1",
      organizationId: "test-org-123",
      clientId: "client_1",
      currencyId: "cur_1",
    });
    const mockOrg = { id: "test-org-123", stripeTaxEnabled: false, invoicePrefix: "INV", invoiceNextNumber: 1 };
    ctx.db.organization.findFirst.mockResolvedValue(mockOrg);
    ctx.db.organization.update.mockResolvedValue({ ...mockOrg, invoiceNextNumber: 2 });
    ctx.db.client.findFirst.mockResolvedValue({ id: "client_1", organizationId: "test-org-123" });
    ctx.db.tax.findMany.mockResolvedValue([]);
    // $transaction(cb) just runs the callback with the same db mock
    ctx.db.$transaction.mockImplementation(async (cb: any) => cb(ctx.db));
    ctx.db.invoice.count.mockResolvedValue(0); // for invoice numbering
    ctx.db.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv_co", ...data }));

    const result = await caller.createChangeOrder({
      projectId: "proj_1",
      lines: [{ sort: 0, name: "Extra page", qty: 1, rate: 500, taxIds: [] }],
    });

    const created = ctx.db.invoice.create.mock.calls[0][0].data;
    expect(created.type).toBe(InvoiceType.ESTIMATE);
    expect(created.isChangeOrder).toBe(true);
    expect(created.projectId).toBe("proj_1");
    expect(created.clientId).toBe("client_1");
    expect(created.currencyId).toBe("cur_1");
    expect(result.id).toBe("inv_co");
    expect(result.type).toBe(InvoiceType.ESTIMATE);
    expect(result.isChangeOrder).toBe(true);
    expect(result.projectId).toBe("proj_1");
  });

  it("create rejects a projectId from another tenant", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "client_1", organizationId: "test-org-123" });
    ctx.db.project.findFirst.mockResolvedValue(null); // project not in this org → assertInOrg throws
    ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123", stripeTaxEnabled: false });
    await expect(
      caller.create({
        clientId: "client_1",
        currencyId: "cur_1",
        projectId: "proj_other",
        lines: [{ sort: 0, name: "Work", qty: 1, rate: 100, taxIds: [] }],
      }),
    ).rejects.toThrow(/not found/i);
  });
});

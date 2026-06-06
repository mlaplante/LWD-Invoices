import { describe, it, expect, beforeEach } from "vitest";
import { Decimal } from "@prisma/client-runtime-utils";
import { contractorsRouter } from "@/server/routers/contractors";
import { createMockContext } from "./mocks/trpc-context";
import { encryptString } from "@/server/services/encryption";

function makeContractor(overrides: Record<string, unknown> = {}) {
  return {
    id: "c_1",
    legalName: "Jane Doe",
    businessName: null,
    taxClassification: "individual",
    tinType: "SSN",
    tinEncrypted: null,
    tinLast4: null,
    email: null,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    zip: null,
    country: "US",
    w9Status: "NOT_REQUESTED",
    w9DocumentPath: null,
    w9ReceivedAt: null,
    exemptFrom1099: false,
    notes: null,
    isArchived: false,
    organizationId: "test-org-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Contractors Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = contractorsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("merges reportable totals onto contractors and redacts the TIN", async () => {
      ctx.db.contractor.findMany.mockResolvedValue([
        makeContractor({ id: "c_1", tinEncrypted: "enc", tinLast4: "6789" }),
      ]);
      ctx.db.contractorPayment.groupBy.mockResolvedValue([
        { contractorId: "c_1", _sum: { amount: new Decimal("1200") } },
      ]);

      const res = await caller.list({ includeArchived: false, year: 2025 });

      expect(res.year).toBe(2025);
      expect(res.contractors[0].ytdReportable).toBe(1200);
      expect(res.contractors[0].hasTin).toBe(true);
      expect(res.contractors[0]).not.toHaveProperty("tinEncrypted");
      expect(res.contractors[0].tinLast4).toBe("6789");
    });

    it("excludes archived contractors by default", async () => {
      ctx.db.contractor.findMany.mockResolvedValue([]);
      ctx.db.contractorPayment.groupBy.mockResolvedValue([]);

      await caller.list({ includeArchived: false });

      expect(ctx.db.contractor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "test-org-123", isArchived: false },
          orderBy: { legalName: "asc" },
        }),
      );
    });
  });

  describe("create", () => {
    it("encrypts the TIN and stores only the last four digits", async () => {
      ctx.db.contractor.create.mockImplementation(async (args: any) =>
        makeContractor({ ...args.data, id: "c_new" }),
      );

      const res = await caller.create({ legalName: "Bob Smith", tinType: "SSN", tin: "123-45-6789" });

      const data = ctx.db.contractor.create.mock.calls[0][0].data;
      expect(data.organizationId).toBe("test-org-123");
      expect(data.tinLast4).toBe("6789");
      expect(typeof data.tinEncrypted).toBe("string");
      expect(data.tinEncrypted).not.toContain("6789"); // stored as ciphertext
      expect(res).not.toHaveProperty("tinEncrypted");
      expect(res.hasTin).toBe(true);
    });

    it("omits TIN fields when no TIN is provided", async () => {
      ctx.db.contractor.create.mockImplementation(async (args: any) =>
        makeContractor({ ...args.data, id: "c_new" }),
      );

      await caller.create({ legalName: "No Tin" });

      const data = ctx.db.contractor.create.mock.calls[0][0].data;
      expect(data.tinEncrypted).toBeUndefined();
      expect(data.tinLast4).toBeUndefined();
    });
  });

  describe("update", () => {
    it("stamps w9ReceivedAt when status flips to RECEIVED", async () => {
      ctx.db.contractor.findFirst.mockResolvedValue(makeContractor());
      ctx.db.contractor.update.mockImplementation(async (args: any) =>
        makeContractor({ ...args.data, id: "c_1" }),
      );

      await caller.update({ id: "c_1", w9Status: "RECEIVED" });

      const data = ctx.db.contractor.update.mock.calls[0][0].data;
      expect(data.w9Status).toBe("RECEIVED");
      expect(data.w9ReceivedAt).toBeInstanceOf(Date);
    });

    it("clears the TIN when an empty string is sent", async () => {
      ctx.db.contractor.findFirst.mockResolvedValue(makeContractor({ tinEncrypted: "enc", tinLast4: "6789" }));
      ctx.db.contractor.update.mockImplementation(async (args: any) => makeContractor({ ...args.data, id: "c_1" }));

      await caller.update({ id: "c_1", tin: "" });

      const data = ctx.db.contractor.update.mock.calls[0][0].data;
      expect(data.tinEncrypted).toBeNull();
      expect(data.tinLast4).toBeNull();
    });

    it("leaves the TIN untouched when tin is omitted", async () => {
      ctx.db.contractor.findFirst.mockResolvedValue(makeContractor({ tinEncrypted: "enc", tinLast4: "6789" }));
      ctx.db.contractor.update.mockImplementation(async (args: any) => makeContractor({ ...args.data, id: "c_1" }));

      await caller.update({ id: "c_1", legalName: "Renamed" });

      const data = ctx.db.contractor.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty("tinEncrypted");
      expect(data).not.toHaveProperty("tinLast4");
    });
  });

  describe("revealTin", () => {
    it("decrypts and returns the full TIN", async () => {
      ctx.db.contractor.findFirst.mockResolvedValue(
        makeContractor({ tinEncrypted: encryptString("123456789"), tinLast4: "6789" }),
      );

      const res = await caller.revealTin({ id: "c_1" });
      expect(res.tin).toBe("123456789");
    });

    it("throws NOT_FOUND when no TIN is stored", async () => {
      ctx.db.contractor.findFirst.mockResolvedValue(makeContractor({ tinEncrypted: null }));

      await expect(caller.revealTin({ id: "c_1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("addPayment", () => {
    beforeEach(() => {
      ctx.db.contractor.findFirst.mockResolvedValue(makeContractor());
      ctx.db.contractorPayment.create.mockImplementation(async (args: any) => ({
        id: "p_1",
        ...args.data,
        amount: new Decimal(String(args.data.amount)),
      }));
    });

    it("defaults a check payment to reportable", async () => {
      const res = await caller.addPayment({ contractorId: "c_1", amount: 500, paidAt: new Date("2025-03-01"), method: "CHECK" });
      expect(res.reportable).toBe(true);
      expect(res.amount).toBe(500);
    });

    it("marks card payments as non-reportable (1099-K)", async () => {
      await caller.addPayment({ contractorId: "c_1", amount: 500, paidAt: new Date("2025-03-01"), method: "CARD" });
      const data = ctx.db.contractorPayment.create.mock.calls[0][0].data;
      expect(data.reportable).toBe(false);
    });

    it("marks third-party network payments as non-reportable", async () => {
      await caller.addPayment({ contractorId: "c_1", amount: 500, paidAt: new Date("2025-03-01"), method: "THIRD_PARTY" });
      const data = ctx.db.contractorPayment.create.mock.calls[0][0].data;
      expect(data.reportable).toBe(false);
    });

    it("honors an explicit reportable override", async () => {
      await caller.addPayment({ contractorId: "c_1", amount: 500, paidAt: new Date("2025-03-01"), method: "CARD", reportable: true });
      const data = ctx.db.contractorPayment.create.mock.calls[0][0].data;
      expect(data.reportable).toBe(true);
    });
  });

  describe("deletePayment", () => {
    it("deletes a payment scoped to the org", async () => {
      ctx.db.contractorPayment.findFirst.mockResolvedValue({ id: "p_1", organizationId: "test-org-123" });
      ctx.db.contractorPayment.delete.mockResolvedValue({ id: "p_1" });

      const res = await caller.deletePayment({ id: "p_1" });
      expect(res).toEqual({ id: "p_1" });
      expect(ctx.db.contractorPayment.delete).toHaveBeenCalledWith({ where: { id: "p_1" } });
    });
  });
});

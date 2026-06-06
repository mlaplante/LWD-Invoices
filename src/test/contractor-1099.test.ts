import { describe, it, expect, beforeEach } from "vitest";
import { Decimal } from "@prisma/client-runtime-utils";
import { createMockPrismaClient } from "./mocks/prisma";
import { get1099Pack, NEC_1099_THRESHOLD } from "@/server/services/contractor-1099";

function makeContractor(overrides: Record<string, unknown> = {}) {
  return {
    id: "c_1",
    legalName: "Jane Doe",
    businessName: null,
    taxClassification: "individual",
    tinType: "SSN",
    tinEncrypted: "enc",
    tinLast4: "6789",
    email: null,
    phone: null,
    addressLine1: "1 Main St",
    addressLine2: null,
    city: "Austin",
    state: "TX",
    zip: "78701",
    country: "US",
    w9Status: "RECEIVED",
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

const org = {
  id: "test-org-123",
  name: "Acme LLC",
  payerTin: "12-3456789",
  addressLine1: "500 Office Rd",
  addressLine2: null,
  city: "Austin",
  state: "TX",
  postalCode: "78702",
  country: "US",
  phone: "512-555-0100",
};

describe("get1099Pack", () => {
  let db: any;

  beforeEach(() => {
    db = createMockPrismaClient();
    db.organization.findUnique.mockResolvedValue(org);
  });

  it("aggregates reportable payments and flags eligible contractors", async () => {
    db.contractor.findMany.mockResolvedValue([
      makeContractor({ id: "c_1", legalName: "Jane Doe" }),
      makeContractor({ id: "c_2", legalName: "Below Threshold", tinLast4: "1111", w9Status: "NOT_REQUESTED" }),
    ]);
    db.contractorPayment.groupBy.mockResolvedValue([
      { contractorId: "c_1", _sum: { amount: new Decimal("1500") }, _count: { _all: 3 } },
      { contractorId: "c_2", _sum: { amount: new Decimal("200") }, _count: { _all: 1 } },
    ]);

    const pack = await get1099Pack(db, "test-org-123", 2025);

    expect(pack.year).toBe(2025);
    expect(pack.threshold).toBe(NEC_1099_THRESHOLD);
    expect(pack.payer.name).toBe("Acme LLC");
    expect(pack.payer.tin).toBe("12-3456789");

    // Sorted by total desc
    expect(pack.rows.map((r) => r.contractorId)).toEqual(["c_1", "c_2"]);

    const jane = pack.rows[0];
    expect(jane.total).toBe(1500);
    expect(jane.paymentCount).toBe(3);
    expect(jane.meetsThreshold).toBe(true);
    expect(jane.eligible).toBe(true);
    expect(jane.missingW9).toBe(false);
    expect(jane.tinMasked).toBe("***-**-6789");

    const below = pack.rows[1];
    expect(below.total).toBe(200);
    expect(below.meetsThreshold).toBe(false);
    expect(below.eligible).toBe(false);
  });

  it("masks an EIN differently from an SSN", async () => {
    db.contractor.findMany.mockResolvedValue([
      makeContractor({ id: "c_3", tinType: "EIN", tinLast4: "4321" }),
    ]);
    db.contractorPayment.groupBy.mockResolvedValue([
      { contractorId: "c_3", _sum: { amount: new Decimal("800") }, _count: { _all: 1 } },
    ]);

    const pack = await get1099Pack(db, "test-org-123", 2025);
    expect(pack.rows[0].tinMasked).toBe("**-***4321");
  });

  it("marks eligible contractors without a W-9 as missingW9", async () => {
    db.contractor.findMany.mockResolvedValue([
      makeContractor({ id: "c_4", w9Status: "REQUESTED", tinLast4: null, tinEncrypted: null }),
    ]);
    db.contractorPayment.groupBy.mockResolvedValue([
      { contractorId: "c_4", _sum: { amount: new Decimal("5000") }, _count: { _all: 2 } },
    ]);

    const pack = await get1099Pack(db, "test-org-123", 2025);
    expect(pack.rows[0].eligible).toBe(true);
    expect(pack.rows[0].missingW9).toBe(true);
    expect(pack.rows[0].hasTin).toBe(false);
    expect(pack.rows[0].tinMasked).toBe("");
  });

  it("excludes exempt contractors from eligibility", async () => {
    db.contractor.findMany.mockResolvedValue([
      makeContractor({ id: "c_5", exemptFrom1099: true }),
    ]);
    db.contractorPayment.groupBy.mockResolvedValue([
      { contractorId: "c_5", _sum: { amount: new Decimal("9000") }, _count: { _all: 4 } },
    ]);

    const pack = await get1099Pack(db, "test-org-123", 2025);
    expect(pack.rows[0].exempt).toBe(true);
    expect(pack.rows[0].eligible).toBe(false);
  });

  it("drops contractors with no payments in the year", async () => {
    db.contractor.findMany.mockResolvedValue([
      makeContractor({ id: "c_1" }),
      makeContractor({ id: "c_paid_nothing" }),
    ]);
    db.contractorPayment.groupBy.mockResolvedValue([
      { contractorId: "c_1", _sum: { amount: new Decimal("700") }, _count: { _all: 1 } },
    ]);

    const pack = await get1099Pack(db, "test-org-123", 2025);
    expect(pack.rows).toHaveLength(1);
    expect(pack.rows[0].contractorId).toBe("c_1");
  });

  it("queries payments within the requested calendar year only", async () => {
    db.contractor.findMany.mockResolvedValue([]);
    db.contractorPayment.groupBy.mockResolvedValue([]);

    await get1099Pack(db, "test-org-123", 2025);

    const call = db.contractorPayment.groupBy.mock.calls[0][0];
    expect(call.where.organizationId).toBe("test-org-123");
    expect(call.where.reportable).toBe(true);
    expect(call.where.paidAt.gte).toEqual(new Date(Date.UTC(2025, 0, 1)));
    expect(call.where.paidAt.lt).toEqual(new Date(Date.UTC(2026, 0, 1)));
  });
});

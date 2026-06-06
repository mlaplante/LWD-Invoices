import type { PrismaClient } from "@/generated/prisma";

// IRS reporting threshold for Form 1099-NEC box 1 (nonemployee compensation).
// A payer must file a 1099-NEC for any contractor paid this much or more in
// reportable compensation during the calendar year.
export const NEC_1099_THRESHOLD = 600;

export type Payer = {
  name: string;
  tin: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
};

export type Contractor1099Row = {
  contractorId: string;
  legalName: string;
  businessName: string;
  taxClassification: string;
  tinType: "SSN" | "EIN" | "";
  tinMasked: string; // e.g. "***-**-1234" / "**-***1234"
  hasTin: boolean;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  total: number; // reportable compensation for the year (box 1)
  paymentCount: number;
  exempt: boolean;
  w9OnFile: boolean;
  meetsThreshold: boolean;
  eligible: boolean; // meets threshold AND not exempt — a 1099-NEC is required
  missingW9: boolean; // eligible but no W-9 received — blocks accurate filing
};

export type Form1099Pack = {
  year: number;
  threshold: number;
  payer: Payer;
  rows: Contractor1099Row[];
};

function maskTin(tinType: "SSN" | "EIN" | "", last4: string | null): string {
  if (!last4) return "";
  return tinType === "EIN" ? `**-***${last4}` : `***-**-${last4}`;
}

function yearRange(year: number) {
  return {
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

/**
 * Build the year-end 1099-NEC pack for an org: the payer block plus a row per
 * contractor that received reportable compensation in the year. Rows are sorted
 * by total descending; eligible payees (>= threshold, not exempt) come with the
 * flags the UI and PDF use to decide what to file.
 */
export async function get1099Pack(
  db: PrismaClient,
  orgId: string,
  year: number,
): Promise<Form1099Pack> {
  const { from, to } = yearRange(year);

  const [org, contractors, totals] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.contractor.findMany({
      where: { organizationId: orgId, isArchived: false },
    }),
    db.contractorPayment.groupBy({
      by: ["contractorId"],
      where: {
        organizationId: orgId,
        reportable: true,
        paidAt: { gte: from, lt: to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const sumByContractor = new Map(
    totals.map((t) => [
      t.contractorId,
      { total: Number(t._sum.amount ?? 0), count: t._count._all },
    ]),
  );

  const payer: Payer = {
    name: org?.name ?? "",
    tin: org?.payerTin ?? "",
    addressLine1: org?.addressLine1 ?? "",
    addressLine2: org?.addressLine2 ?? "",
    city: org?.city ?? "",
    state: org?.state ?? "",
    postalCode: org?.postalCode ?? "",
    country: org?.country ?? "",
    phone: org?.phone ?? "",
  };

  const rows: Contractor1099Row[] = contractors
    .map((c) => {
      const agg = sumByContractor.get(c.id);
      const total = agg?.total ?? 0;
      const tinType = (c.tinType ?? "") as "SSN" | "EIN" | "";
      const meetsThreshold = total >= NEC_1099_THRESHOLD;
      const exempt = c.exemptFrom1099;
      const w9OnFile = c.w9Status === "RECEIVED";
      const eligible = meetsThreshold && !exempt;
      return {
        contractorId: c.id,
        legalName: c.legalName,
        businessName: c.businessName ?? "",
        taxClassification: c.taxClassification ?? "",
        tinType,
        tinMasked: maskTin(tinType, c.tinLast4),
        hasTin: c.tinLast4 != null,
        addressLine1: c.addressLine1 ?? "",
        addressLine2: c.addressLine2 ?? "",
        city: c.city ?? "",
        state: c.state ?? "",
        zip: c.zip ?? "",
        country: c.country ?? "",
        total,
        paymentCount: agg?.count ?? 0,
        exempt,
        w9OnFile,
        meetsThreshold,
        eligible,
        missingW9: eligible && !w9OnFile,
      };
    })
    // Drop payees with no reportable payments this year — they have nothing to
    // report and would only clutter the pack.
    .filter((r) => r.paymentCount > 0)
    .sort((a, b) => b.total - a.total);

  return { year, threshold: NEC_1099_THRESHOLD, payer, rows };
}

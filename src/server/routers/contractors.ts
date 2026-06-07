import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { idInput } from "../lib/schemas";
import { getForOrg } from "../lib/get-for-org";
import { logAudit } from "../services/audit";
import { encryptString, decryptString } from "../services/encryption";
import { ContractorPaymentMethod } from "@/generated/prisma";

// Federal tax classification (Form W-9, Line 3). Corporations are generally
// exempt from 1099-NEC reporting; the UI uses this to suggest the exempt flag.
const TAX_CLASSIFICATIONS = [
  "individual",
  "c_corp",
  "s_corp",
  "partnership",
  "trust_estate",
  "llc",
  "other",
] as const;

const PAYMENT_METHODS = [
  "CHECK",
  "ACH",
  "WIRE",
  "CASH",
  "CARD",
  "THIRD_PARTY",
  "OTHER",
] as const;

// Methods reported to the IRS by the processor on a 1099-K — excluded from the
// payer's 1099-NEC total unless the user explicitly overrides.
const NON_REPORTABLE_METHODS = new Set<ContractorPaymentMethod>([
  ContractorPaymentMethod.CARD,
  ContractorPaymentMethod.THIRD_PARTY,
]);

// Keep only the digits of a TIN ("12-3456789" / "123-45-6789" → "123456789").
function tinDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

const w9Fields = {
  legalName: z.string().min(1),
  businessName: z.string().optional(),
  taxClassification: z.enum(TAX_CLASSIFICATIONS).optional(),
  tinType: z.enum(["SSN", "EIN"]).optional(),
  // Plain-text TIN from the form. Encrypted before persistence; never stored or
  // returned in the clear (only the last four digits are kept for display).
  tin: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  w9Status: z.enum(["NOT_REQUESTED", "REQUESTED", "RECEIVED"]).optional(),
  exemptFrom1099: z.boolean().optional(),
  notes: z.string().optional(),
};

// Strip the TIN out of a contractor row before returning it to the client.
function redactTin<T extends { tinEncrypted: string | null }>(c: T) {
  const { tinEncrypted: _omit, ...rest } = c;
  return { ...rest, hasTin: _omit != null };
}

const paymentInput = {
  amount: z.number().positive(),
  paidAt: z.coerce.date(),
  method: z.enum(PAYMENT_METHODS).default("CHECK"),
  memo: z.string().optional(),
  reference: z.string().optional(),
  // When omitted, reportability is inferred from the method.
  reportable: z.boolean().optional(),
  expenseId: z.string().optional(),
};

export const contractorsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          includeArchived: z.boolean().default(false),
          // Tax year used to compute each contractor's reportable total.
          year: z.number().int().min(2000).max(2100).optional(),
        })
        .default({ includeArchived: false }),
    )
    .query(async ({ ctx, input }) => {
      const contractors = await ctx.db.contractor.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.includeArchived ? {} : { isArchived: false }),
        },
        orderBy: { legalName: "asc" },
      });

      const year = input.year ?? new Date().getUTCFullYear();
      const from = new Date(Date.UTC(year, 0, 1));
      const to = new Date(Date.UTC(year + 1, 0, 1));

      // One grouped roll-up of reportable payments for the year, merged onto
      // the contractor list — avoids an N+1 over payees.
      const totals = await ctx.db.contractorPayment.groupBy({
        by: ["contractorId"],
        where: {
          organizationId: ctx.orgId,
          reportable: true,
          paidAt: { gte: from, lt: to },
        },
        _sum: { amount: true },
      });
      const totalByContractor = new Map(
        totals.map((t) => [t.contractorId, Number(t._sum.amount ?? 0)]),
      );

      return {
        year,
        contractors: contractors.map((c) => ({
          ...redactTin(c),
          ytdReportable: totalByContractor.get(c.id) ?? 0,
        })),
      };
    }),

  getById: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const contractor = await ctx.db.contractor.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { payments: { orderBy: { paidAt: "desc" } } },
      });
      if (!contractor) throw new TRPCError({ code: "NOT_FOUND" });
      const { payments, ...rest } = contractor;
      return {
        ...redactTin(rest),
        payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      };
    }),

  create: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object(w9Fields))
    .mutation(async ({ ctx, input }) => {
      const { tin, email, ...rest } = input;
      const digits = tin ? tinDigits(tin) : "";

      const created = await ctx.db.contractor.create({
        data: {
          ...rest,
          email: email || undefined,
          organizationId: ctx.orgId,
          tinEncrypted: digits ? encryptString(digits) : undefined,
          tinLast4: digits ? digits.slice(-4) : undefined,
        },
      });
      await logAudit({
        action: "CREATED",
        entityType: "Contractor",
        entityId: created.id,
        entityLabel: created.legalName,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return redactTin(created);
    }),

  update: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ id: z.string(), ...w9Fields }).partial({ legalName: true }))
    .mutation(async ({ ctx, input }) => {
      const { id, tin, email, ...rest } = input;
      await getForOrg(ctx.db.contractor, id, ctx.orgId, { entityName: "Contractor" });

      const digits = tin !== undefined ? tinDigits(tin) : undefined;

      const updated = await ctx.db.contractor.update({
        where: { id },
        data: {
          ...rest,
          ...(email !== undefined ? { email: email || null } : {}),
          // tin === "" clears the stored TIN; a populated value re-encrypts it;
          // undefined leaves it untouched.
          ...(digits !== undefined
            ? {
                tinEncrypted: digits ? encryptString(digits) : null,
                tinLast4: digits ? digits.slice(-4) : null,
              }
            : {}),
          // Stamp the received timestamp the moment W-9 is marked RECEIVED.
          ...(rest.w9Status === "RECEIVED" ? { w9ReceivedAt: new Date() } : {}),
        },
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Contractor",
        entityId: updated.id,
        entityLabel: updated.legalName,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return redactTin(updated);
    }),

  // Toggle the self-service contractor portal for a contractor. Returns the
  // portal token so the admin can copy/share the link.
  setPortalAccess: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await getForOrg(ctx.db.contractor, input.id, ctx.orgId, { entityName: "Contractor" });
      const updated = await ctx.db.contractor.update({
        where: { id: input.id },
        data: { portalEnabled: input.enabled },
        select: { id: true, portalEnabled: true, portalToken: true },
      });
      return updated;
    }),

  // Decrypt and return the full TIN — restricted to org admins, and only when
  // they need it to file. Logged as a VIEWED audit event.
  revealTin: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const contractor = await getForOrg(ctx.db.contractor, input.id, ctx.orgId, {
        entityName: "Contractor",
      });
      const row = contractor as { tinEncrypted: string | null; legalName: string };
      if (!row.tinEncrypted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No TIN on file" });
      }
      await logAudit({
        action: "VIEWED",
        entityType: "Contractor.TIN",
        entityId: input.id,
        entityLabel: row.legalName,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return { tin: decryptString(row.tinEncrypted) };
    }),

  archive: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ id: z.string(), isArchived: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      await getForOrg(ctx.db.contractor, input.id, ctx.orgId, { entityName: "Contractor" });
      const updated = await ctx.db.contractor.update({
        where: { id: input.id },
        data: { isArchived: input.isArchived },
      });
      return redactTin(updated);
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await getForOrg(ctx.db.contractor, input.id, ctx.orgId, {
        entityName: "Contractor",
      });
      // Payments cascade on delete (see schema FK).
      await ctx.db.contractor.delete({ where: { id: input.id } });
      await logAudit({
        action: "DELETED",
        entityType: "Contractor",
        entityId: input.id,
        entityLabel: (existing as { legalName: string }).legalName,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return { id: input.id };
    }),

  // ── Payments ────────────────────────────────────────────────────────────────

  addPayment: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ contractorId: z.string(), ...paymentInput }))
    .mutation(async ({ ctx, input }) => {
      await getForOrg(ctx.db.contractor, input.contractorId, ctx.orgId, {
        entityName: "Contractor",
      });
      const method = input.method as ContractorPaymentMethod;
      const reportable = input.reportable ?? !NON_REPORTABLE_METHODS.has(method);

      const created = await ctx.db.contractorPayment.create({
        data: {
          contractorId: input.contractorId,
          organizationId: ctx.orgId,
          amount: input.amount,
          paidAt: input.paidAt,
          method,
          memo: input.memo,
          reference: input.reference,
          reportable,
          expenseId: input.expenseId,
        },
      });
      return { ...created, amount: Number(created.amount) };
    }),

  updatePayment: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        id: z.string(),
        amount: z.number().positive().optional(),
        paidAt: z.coerce.date().optional(),
        method: z.enum(PAYMENT_METHODS).optional(),
        memo: z.string().nullable().optional(),
        reference: z.string().nullable().optional(),
        reportable: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await getForOrg(ctx.db.contractorPayment, id, ctx.orgId, { entityName: "Payment" });
      const updated = await ctx.db.contractorPayment.update({
        where: { id },
        data: rest,
      });
      return { ...updated, amount: Number(updated.amount) };
    }),

  deletePayment: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      await getForOrg(ctx.db.contractorPayment, input.id, ctx.orgId, {
        entityName: "Payment",
      });
      await ctx.db.contractorPayment.delete({ where: { id: input.id } });
      return { id: input.id };
    }),
});

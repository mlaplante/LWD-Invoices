import { TRPCError } from "@trpc/server";
import { InvoiceStatus, UnmatchedPaymentStatus } from "@/generated/prisma";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "../trpc";
import { logAudit } from "../services/audit";
import { resolvePaymentStatus } from "../services/invoice-balance";
import { sendPaymentReceiptEmail } from "../services/payment-receipt-email";

const EPSILON = 0.005;
const methodSchema = z.enum(["check", "zelle", "ach", "venmo", "wire", "cash", "other"]);
const openInvoiceStatuses: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

const numberValue = (value: { toNumber(): number } | number) => Number(value);

export const paymentReconciliationRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.array(z.nativeEnum(UnmatchedPaymentStatus)).optional() }))
    .query(({ ctx, input }) => ctx.db.unmatchedPayment.findMany({
      where: {
        organizationId: ctx.orgId,
        status: { in: input.status ?? [UnmatchedPaymentStatus.UNMATCHED, UnmatchedPaymentStatus.PARTIALLY_MATCHED] },
      },
      orderBy: { receivedAt: "desc" },
    })),

  create: requireRole("OWNER", "ADMIN")
    .input(z.object({
      amount: z.number().positive(),
      method: methodSchema,
      reference: z.string().max(200).optional(),
      payerName: z.string().max(200).optional(),
      notes: z.string().max(2000).optional(),
      receivedAt: z.coerce.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const payment = await ctx.db.unmatchedPayment.create({
        data: {
          ...input,
          organizationId: ctx.orgId,
          status: UnmatchedPaymentStatus.UNMATCHED,
        },
      });
      await logAudit({
        action: "CREATED",
        entityType: "UnmatchedPayment",
        entityId: payment.id,
        entityLabel: input.payerName,
        diff: { amount: input.amount, method: input.method, reference: input.reference },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return payment;
    }),

  ignore: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const payment = await ctx.db.unmatchedPayment.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true, status: true },
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND" });
      if (payment.status !== UnmatchedPaymentStatus.UNMATCHED) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only unmatched payments can be ignored." });
      }
      const updated = await ctx.db.unmatchedPayment.update({
        where: { id: payment.id },
        data: { status: UnmatchedPaymentStatus.IGNORED },
      });
      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "UnmatchedPayment",
        entityId: payment.id,
        diff: { from: payment.status, to: UnmatchedPaymentStatus.IGNORED },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return updated;
    }),

  unignore: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const payment = await ctx.db.unmatchedPayment.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true, status: true },
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND" });
      if (payment.status !== UnmatchedPaymentStatus.IGNORED) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only ignored payments can be restored." });
      }
      const updated = await ctx.db.unmatchedPayment.update({
        where: { id: payment.id },
        data: { status: UnmatchedPaymentStatus.UNMATCHED },
      });
      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "UnmatchedPayment",
        entityId: payment.id,
        diff: { from: payment.status, to: UnmatchedPaymentStatus.UNMATCHED },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return updated;
    }),

  match: requireRole("OWNER", "ADMIN")
    .input(z.object({
      id: z.string(),
      applications: z.array(z.object({ invoiceId: z.string(), amount: z.number().positive() })).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const matched = await ctx.db.$transaction(async (tx) => {
        const unmatched = await tx.unmatchedPayment.findFirst({
          where: { id: input.id, organizationId: ctx.orgId },
        });
        if (!unmatched) throw new TRPCError({ code: "NOT_FOUND" });
        if (unmatched.status === UnmatchedPaymentStatus.MATCHED || unmatched.status === UnmatchedPaymentStatus.IGNORED) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This payment cannot be matched." });
        }

        const allocation = input.applications.reduce((sum, application) => sum + application.amount, 0);
        const remaining = numberValue(unmatched.amount) - numberValue(unmatched.matchedAmount);
        if (allocation > remaining + EPSILON) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Allocation exceeds the remaining payment amount." });
        }

        const applications = [] as Array<{ invoiceId: string; invoiceNumber: string; amount: number }>;
        for (const application of input.applications) {
          const invoice = await tx.invoice.findFirst({
            where: { id: application.invoiceId, organizationId: ctx.orgId },
            include: { payments: true, creditNotesReceived: true },
          });
          if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
          if (!openInvoiceStatuses.includes(invoice.status)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Invoice ${invoice.number} is not open for payment.` });
          }

          await tx.payment.create({
            data: {
              amount: application.amount,
              method: unmatched.method,
              transactionId: unmatched.reference ?? undefined,
              notes: unmatched.notes ?? undefined,
              paidAt: unmatched.receivedAt,
              unmatchedPaymentId: unmatched.id,
              invoiceId: invoice.id,
              organizationId: ctx.orgId,
            },
          });

          const paymentsSum = invoice.payments.reduce((sum, payment) => sum + numberValue(payment.amount), 0) + application.amount;
          const creditApplied = invoice.creditNotesReceived.reduce((sum, credit) => sum + numberValue(credit.amount), 0);
          await tx.invoice.update({
            where: { id: invoice.id, organizationId: ctx.orgId },
            data: {
              status: resolvePaymentStatus({
                total: numberValue(invoice.total),
                paymentsSum,
                creditApplied,
              }),
            },
          });
          applications.push({ invoiceId: invoice.id, invoiceNumber: invoice.number, amount: application.amount });
        }

        const fullyMatched = remaining - allocation <= EPSILON;
        await tx.unmatchedPayment.update({
          where: { id: unmatched.id },
          data: {
            matchedAmount: { increment: allocation },
            status: fullyMatched ? UnmatchedPaymentStatus.MATCHED : UnmatchedPaymentStatus.PARTIALLY_MATCHED,
            ...(fullyMatched ? { matchedAt: new Date() } : {}),
          },
        });
        return applications;
      });

      await Promise.all(matched.map(async (application) => {
        const { inngest } = await import("@/inngest/client");
        await inngest.send({
          name: "invoice/payment.received",
          data: { invoiceId: application.invoiceId, trigger: "PAYMENT_RECEIVED" },
        }).catch(() => {});
        await sendPaymentReceiptEmail({
          invoiceId: application.invoiceId,
          amountPaid: application.amount,
          organizationId: ctx.orgId,
        }).catch(() => {});
        await logAudit({
          action: "PAYMENT_RECEIVED",
          entityType: "Invoice",
          entityId: application.invoiceId,
          entityLabel: application.invoiceNumber,
          diff: { amount: application.amount, source: "UnmatchedPayment" },
          userId: ctx.userId,
          organizationId: ctx.orgId,
        }).catch(() => {});
      }));

      return { matched: matched.length };
    }),

  openInvoices: protectedProcedure
    .input(z.object({ search: z.string().max(100).optional(), clientId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const invoices = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          isArchived: false,
          status: { in: openInvoiceStatuses },
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(input.search ? {
            OR: [
              { number: { contains: input.search, mode: "insensitive" } },
              { client: { name: { contains: input.search, mode: "insensitive" } } },
            ],
          } : {}),
        },
        include: {
          client: { select: { id: true, name: true } },
          payments: { select: { amount: true } },
          creditNotesReceived: { select: { amount: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 50,
      });

      return invoices.map((invoice) => ({
        ...invoice,
        balance: numberValue(invoice.total)
          - invoice.payments.reduce((sum, payment) => sum + numberValue(payment.amount), 0)
          - invoice.creditNotesReceived.reduce((sum, credit) => sum + numberValue(credit.amount), 0),
      }));
    }),
});

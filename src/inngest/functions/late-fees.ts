import { inngest } from "../client";
import { db } from "@/server/db";
import { notifyOrgAdmins } from "@/server/services/notifications";
import {
  calculateLateFee,
  shouldApplyLateFee,
  type LateFeeConfig,
  type InvoiceFeeContext,
} from "@/server/services/late-fees";

export const processLateFees = inngest.createFunction(
  { id: "process-late-fees", name: "Process Late Fees", triggers: [{ cron: "30 7 * * *" }] }, // daily at 7:30am UTC
  async () => {
    const now = new Date();

    // Find all organizations with late fees enabled
    const orgs = await db.organization.findMany({
      where: { lateFeeEnabled: true },
      select: {
        id: true,
        lateFeeEnabled: true,
        lateFeeType: true,
        lateFeeAmount: true,
        lateFeeGraceDays: true,
        lateFeeRecurring: true,
        lateFeeMaxApplications: true,
        lateFeeIntervalDays: true,
      },
    });

    let totalProcessed = 0;
    let totalApplied = 0;

    for (const org of orgs) {
      const config: LateFeeConfig = {
        enabled: org.lateFeeEnabled,
        feeType: org.lateFeeType,
        feeRate: Number(org.lateFeeAmount),
        graceDays: org.lateFeeGraceDays,
        recurring: org.lateFeeRecurring,
        intervalDays: org.lateFeeIntervalDays,
        maxApplications: org.lateFeeMaxApplications,
      };

      // Find overdue invoices for this org
      const invoices = await db.invoice.findMany({
        where: {
          organizationId: org.id,
          status: "OVERDUE",
          isArchived: false,
          dueDate: { not: null },
        },
        include: {
          lateFeeEntries: {
            where: { isWaived: false },
            orderBy: { createdAt: "desc" },
          },
          currency: true,
          client: true,
        },
      });

      for (const invoice of invoices) {
        totalProcessed++;

        const ctx: InvoiceFeeContext = {
          dueDate: invoice.dueDate!,
          existingFeeCount: invoice.lateFeeEntries.length,
          lastFeeDate:
            invoice.lateFeeEntries.length > 0
              ? invoice.lateFeeEntries[0].createdAt
              : null,
        };

        if (!shouldApplyLateFee(config, ctx, now)) continue;

        const feeAmount = calculateLateFee(
          config.feeType!,
          config.feeRate,
          Number(invoice.total),
        );
        if (feeAmount <= 0) continue;

        await db.lateFeeEntry.create({
          data: {
            amount: feeAmount,
            feeType: config.feeType!,
            feeRate: config.feeRate,
            invoiceId: invoice.id,
            organizationId: org.id,
          },
        });

        totalApplied++;

        const sym = invoice.currency.symbol;
        await notifyOrgAdmins(org.id, {
          type: "INVOICE_OVERDUE",
          title: `Late fee applied to Invoice #${invoice.number}`,
          body: `${sym}${feeAmount.toFixed(2)} late fee charged to ${invoice.client.name}`,
          link: `/invoices/${invoice.id}`,
        });
      }
    }

    return { processed: totalProcessed, applied: totalApplied };
  },
);

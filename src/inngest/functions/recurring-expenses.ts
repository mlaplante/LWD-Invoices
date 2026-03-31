import { inngest } from "../client";
import { db } from "@/server/db";
import { computeNextRunAt } from "./recurring-invoices";

export const processRecurringExpenses = inngest.createFunction(
  { id: "process-recurring-expenses", name: "Process Recurring Expenses" },
  { cron: "0 6 * * *" },
  async () => {
    const now = new Date();

    const due = await db.recurringExpense.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
    });

    let succeeded = 0;
    let failed = 0;

    for (const rec of due) {
      try {
        let nextRun = new Date(rec.nextRunAt);
        let count = rec.occurrenceCount;

        while (nextRun <= now) {
          if (rec.maxOccurrences !== null && count >= rec.maxOccurrences) break;
          if (rec.endDate !== null && nextRun > rec.endDate) break;

          await db.$transaction(async (tx) => {
            await tx.expense.create({
              data: {
                name: rec.name,
                description: rec.description,
                qty: rec.qty,
                rate: rec.rate,
                reimbursable: rec.reimbursable,
                dueDate: nextRun,
                taxId: rec.taxId,
                categoryId: rec.categoryId,
                supplierId: rec.supplierId,
                projectId: rec.projectId,
                organizationId: rec.organizationId,
                recurringExpenseId: rec.id,
              },
            });

            count++;
            const newNextRun = computeNextRunAt(nextRun, rec.frequency, rec.interval);
            const maxReached = rec.maxOccurrences !== null && count >= rec.maxOccurrences;
            const pastEnd = rec.endDate !== null && newNextRun > rec.endDate;

            await tx.recurringExpense.update({
              where: { id: rec.id },
              data: {
                occurrenceCount: count,
                nextRunAt: newNextRun,
                isActive: !(maxReached || pastEnd),
              },
            });

            nextRun = newNextRun;
          });

          succeeded++;
        }
      } catch {
        failed++;
      }
    }

    return { processed: due.length, succeeded, failed };
  },
);

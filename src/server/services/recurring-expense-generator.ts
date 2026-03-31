import { PrismaClient, RecurringExpense } from "@/generated/prisma";
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";

/**
 * Generate all due expenses for a single recurring expense template.
 * Handles catch-up for multiple missed occurrences.
 * Each occurrence is created atomically with its schedule advancement.
 */
export async function generateExpensesForRecurring(
  db: PrismaClient,
  rec: RecurringExpense,
  now: Date,
): Promise<number> {
  let nextRun = new Date(rec.nextRunAt);
  let count = rec.occurrenceCount;
  let generated = 0;

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

    generated++;
  }

  return generated;
}

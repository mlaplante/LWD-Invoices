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
      const expense = await tx.expense.create({
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
          lastRunDate: nextRun,
          totalGenerated: { increment: 1 },
        },
      });

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          action: "CREATED",
          entityType: "Expense",
          entityId: expense.id,
          entityLabel: expense.name,
          organizationId: rec.organizationId,
        },
      });

      // Create notification for org owner
      const owner = await tx.user.findFirst({
        where: { organizationId: rec.organizationId, role: "OWNER" },
      });

      if (owner) {
        await tx.notification.create({
          data: {
            type: "RECURRING_EXPENSE_GENERATED",
            title: "Recurring expense generated",
            body: `"${rec.name}" expense was automatically created.`,
            userId: owner.id,
            organizationId: rec.organizationId,
            link: "/expenses",
          },
        });
      }

      nextRun = newNextRun;
    });

    generated++;
  }

  return generated;
}

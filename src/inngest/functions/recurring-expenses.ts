import { inngest } from "../client";
import { db } from "@/server/db";
import { generateExpensesForRecurring } from "@/server/services/recurring-expense-generator";

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
        await generateExpensesForRecurring(db, rec, now);
        succeeded++;
      } catch {
        failed++;
      }
    }

    return { processed: due.length, succeeded, failed };
  },
);

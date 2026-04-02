import type { PrismaClient } from "@/generated/prisma";

const MIN_INVOICES = 3;

/**
 * Calculates the percentage of a client's invoices paid on or before due date.
 * Returns null if fewer than MIN_INVOICES paid invoices (not enough data).
 */
export async function getClientOnTimePercent(
  db: PrismaClient,
  clientId: string
): Promise<number | null> {
  const paidInvoices = await db.invoice.findMany({
    where: {
      clientId,
      status: "PAID",
      dueDate: { not: null },
    },
    select: {
      dueDate: true,
      payments: {
        select: { paidAt: true },
        orderBy: { paidAt: "desc" },
        take: 1,
      },
    },
  });

  if (paidInvoices.length < MIN_INVOICES) return null;

  let onTime = 0;
  for (const inv of paidInvoices) {
    if (!inv.dueDate || inv.payments.length === 0) continue;
    const lastPayment = inv.payments[0];
    const dueDay = Date.UTC(
      inv.dueDate.getUTCFullYear(),
      inv.dueDate.getUTCMonth(),
      inv.dueDate.getUTCDate()
    );
    const paidDay = Date.UTC(
      lastPayment.paidAt.getUTCFullYear(),
      lastPayment.paidAt.getUTCMonth(),
      lastPayment.paidAt.getUTCDate()
    );
    if (paidDay <= dueDay) onTime++;
  }

  return Math.round((onTime / paidInvoices.length) * 100);
}

/**
 * Returns true if client qualifies for skipping pre-due reminders.
 */
export async function isReliablePayer(
  db: PrismaClient,
  clientId: string,
  threshold: number
): Promise<boolean> {
  const percent = await getClientOnTimePercent(db, clientId);
  if (percent === null) return false;
  return percent >= threshold;
}

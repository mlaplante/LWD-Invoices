import { PrismaClient } from "@/generated/prisma";

/**
 * Atomically generate the next invoice number for an organization.
 *
 * Format: {prefix}-{YYYY}-{0001}
 * e.g.    INV-2026-0001
 *
 * Must be called inside the same transaction as the invoice INSERT to prevent
 * gaps on failure.
 */
export async function generateInvoiceNumber(
  db: PrismaClient,
  orgId: string
): Promise<string> {
  const org = await db.organization.update({
    where: { id: orgId },
    data: { invoiceNextNumber: { increment: 1 } },
    select: { invoicePrefix: true, invoiceNextNumber: true },
  });

  // invoiceNextNumber was incremented, so the number we just "claimed" is the new value
  const year = new Date().getFullYear();
  const padded = String(org.invoiceNextNumber).padStart(4, "0");

  return `${org.invoicePrefix}-${year}-${padded}`;
}

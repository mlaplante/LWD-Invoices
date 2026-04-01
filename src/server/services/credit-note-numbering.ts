import { db } from "../db";

/**
 * Format a credit note number from prefix and sequential number.
 * Pads to at least 4 digits.
 */
export function formatCreditNoteNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

/**
 * Generate the next credit note number for an organization.
 * Atomically increments the counter.
 */
export async function generateCreditNoteNumber(
  organizationId: string,
): Promise<string> {
  const org = await db.organization.update({
    where: { id: organizationId },
    data: { creditNoteNextNumber: { increment: 1 } },
    select: { creditNotePrefix: true, creditNoteNextNumber: true },
  });

  // The returned number is already incremented, so the one we use is (returned - 1)
  const seq = org.creditNoteNextNumber - 1;
  return formatCreditNoteNumber(org.creditNotePrefix, seq);
}

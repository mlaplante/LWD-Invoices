import { db } from "../db";

export type ClientRetentionStatus = "active" | "recent" | "warm" | "cold";

export interface ClientActivityInput {
  lastInvoiceAt: Date | null;
  lastPaymentAt: Date | null;
  lastCompletedProjectAt: Date | null;
  hasActiveProject: boolean;
}

const DAY_MS = 86_400_000;

export function deriveClientStatus(input: ClientActivityInput, now: Date): ClientRetentionStatus {
  if (input.hasActiveProject) return "active";

  const candidates = [input.lastInvoiceAt, input.lastPaymentAt, input.lastCompletedProjectAt]
    .filter((d): d is Date => d != null)
    .map((d) => d.getTime());

  if (candidates.length === 0) return "cold";

  const mostRecent = Math.max(...candidates);
  const ageDays = Math.floor((now.getTime() - mostRecent) / DAY_MS);

  if (ageDays <= 30) return "active";
  if (ageDays < 90) return "recent";
  if (ageDays < 365) return "warm";
  return "cold";
}

export async function getClientActivity(
  clientId: string,
  organizationId: string,
): Promise<ClientActivityInput> {
  const [lastInvoice, lastPayment, lastCompletedProject, activeProjectCount] = await Promise.all([
    db.invoice.findFirst({
      where: { clientId, organizationId, isArchived: false },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    db.payment.findFirst({
      where: { invoice: { clientId }, organizationId },
      orderBy: { paidAt: "desc" },
      select: { paidAt: true },
    }),
    db.project.findFirst({
      where: { clientId, organizationId, status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    db.project.count({
      where: { clientId, organizationId, status: "ACTIVE" },
    }),
  ]);

  return {
    lastInvoiceAt: lastInvoice?.date ?? null,
    lastPaymentAt: lastPayment?.paidAt ?? null,
    lastCompletedProjectAt: lastCompletedProject?.updatedAt ?? null,
    hasActiveProject: activeProjectCount > 0,
  };
}

export async function getClientStatus(
  clientId: string,
  organizationId: string,
  now: Date = new Date(),
): Promise<ClientRetentionStatus> {
  const activity = await getClientActivity(clientId, organizationId);
  return deriveClientStatus(activity, now);
}

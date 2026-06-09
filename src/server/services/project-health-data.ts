/**
 * Project health data builder.
 *
 * Reads Prisma aggregates per project and constructs a ProjectHealthInput
 * ready to be fed into the pure scorer (calculateProjectHealthScore).
 * Mirrors the patterns in analytics-data.ts: typeof Db for the db param,
 * .toNumber() on Decimals, InvoiceStatus enum over string literals.
 */

import { InvoiceStatus, ProjectStatus } from "@/generated/prisma";
import type { db as Db } from "../db";
import type { ProjectHealthInput } from "./project-health-score";

/** Statuses that make an invoice count as overdue for client-health purposes. */
const OVERDUE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

/**
 * Build the health-score input for a single project scoped to an org.
 * Returns null when no project is found (or the project belongs to a
 * different org).
 */
export async function buildProjectHealthInput(
  db: typeof Db,
  orgId: string,
  projectId: string,
  now: Date,
): Promise<ProjectHealthInput | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    select: {
      id: true,
      name: true,
      rate: true,
      projectedHours: true,
      isFlatRate: true,
      clientId: true,
      client: { select: { id: true, name: true } },
      tasks: { select: { isCompleted: true, dueDate: true } },
      timeEntries: {
        select: {
          minutes: true,
          invoiceLineId: true,
          retainerId: true,
        },
      },
    },
  });

  if (!project) return null;

  const rate = project.rate.toNumber();

  // ── Budget & client invoices — run in parallel ─────────────────────────────
  // Change orders: approved proposals attached to this project.
  // Client invoices: fetched once for both overdue calculation and engagement;
  // merges the previous two separate invoice queries into one round-trip.
  const [changeOrders, clientInvoices] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: orgId,
        projectId,
        isChangeOrder: true,
        status: InvoiceStatus.ACCEPTED,
      },
      select: { total: true },
    }),
    db.invoice.findMany({
      where: { organizationId: orgId, clientId: project.clientId, isArchived: false },
      select: { id: true, total: true, status: true, dueDate: true },
    }),
  ]);

  const changeOrderTotal = changeOrders.reduce((sum, co) => sum + co.total.toNumber(), 0);
  const effectiveBudget = project.projectedHours * rate + changeOrderTotal;

  // ── Overdue invoices — derived in-memory from the merged query ─────────────
  const overdueInvoices = clientInvoices.filter(
    (inv) =>
      OVERDUE_STATUSES.includes(inv.status) &&
      inv.dueDate != null &&
      inv.dueDate < now,
  );
  const overdueInvoiceCount = overdueInvoices.length;
  const overdueInvoiceAmount = overdueInvoices.reduce((sum, inv) => sum + inv.total.toNumber(), 0);

  // ── Time entries ───────────────────────────────────────────────────────────
  let loggedHours = 0;
  let billableHours = 0;
  let unbilledBillableHours = 0;

  // Billable rule: retainer entry, or this project is hourly with a positive rate
  const isBillableProject = !project.isFlatRate && project.rate.toNumber() > 0;

  for (const entry of project.timeEntries) {
    const mins = entry.minutes.toNumber();
    const hours = mins / 60;
    loggedHours += hours;

    const isBillable = entry.retainerId != null || isBillableProject;

    if (isBillable) {
      billableHours += hours;
      if (entry.invoiceLineId == null) {
        unbilledBillableHours += hours;
      }
    }
  }

  const loggedValue = loggedHours * rate;

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const totalTasks = project.tasks.length;
  const overdueTasks = project.tasks.filter(
    (t) => !t.isCompleted && t.dueDate != null && t.dueDate < now,
  ).length;

  // ── Email engagement (client-level, via invoice ids) ───────────────────────
  // Mirror buildClientHealthInputForClient: aggregate email events per invoice,
  // counting sent (any event) / opened.
  const invoiceIds = clientInvoices.map((inv) => inv.id);

  let emailsSent = 0;
  let emailsOpened = 0;

  if (invoiceIds.length > 0) {
    const events = await db.emailEvent.findMany({
      where: { organizationId: orgId, invoiceId: { in: invoiceIds } },
      select: { invoiceId: true, type: true },
    });
    const perInvoice = new Map<string, { opened: boolean }>();
    for (const e of events) {
      if (!e.invoiceId) continue;
      const entry = perInvoice.get(e.invoiceId) ?? { opened: false };
      if (e.type === "email.opened") entry.opened = true;
      perInvoice.set(e.invoiceId, entry);
    }
    for (const id of invoiceIds) {
      const e = perInvoice.get(id);
      if (!e) continue;
      emailsSent++;
      if (e.opened) emailsOpened++;
    }
  }

  const hasActivity = totalTasks > 0 || loggedHours > 0;

  return {
    projectId: project.id,
    projectName: project.name,
    clientName: project.client.name,
    effectiveBudget,
    loggedValue,
    isFlatRate: project.isFlatRate,
    totalTasks,
    overdueTasks,
    billableHours,
    unbilledBillableHours,
    overdueInvoiceCount,
    overdueInvoiceAmount,
    emailsSent,
    emailsOpened,
    hasActivity,
  };
}

/**
 * Build health-score inputs for all non-archived projects in an org.
 *
 * Per-project builds run in parallel via Promise.all, so the wall-clock cost
 * is bounded by the slowest single project rather than sum-of-all. For very
 * large orgs a batched/p-limit approach is a future improvement to avoid
 * overwhelming the connection pool.
 */
export async function buildProjectHealthInputs(
  db: typeof Db,
  orgId: string,
  now: Date,
): Promise<ProjectHealthInput[]> {
  const projects = await db.project.findMany({
    where: { organizationId: orgId, status: { not: ProjectStatus.ARCHIVED } },
    select: { id: true },
  });

  const results = await Promise.all(
    projects.map((p) => buildProjectHealthInput(db, orgId, p.id, now)),
  );
  return results.filter((r): r is ProjectHealthInput => r !== null);
}

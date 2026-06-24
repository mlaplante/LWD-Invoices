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

// Structural shapes (Decimal is just `{ toNumber(): number }`) so the in-memory
// assembler is shared by the single-project and bulk paths without importing
// Prisma's Decimal type.
type Decimalish = { toNumber(): number };
type ProjectHealthRow = {
  id: string;
  name: string;
  rate: Decimalish;
  projectedHours: number;
  isFlatRate: boolean;
  clientId: string;
  client: { id: string; name: string };
  tasks: { isCompleted: boolean; dueDate: Date | null }[];
  timeEntries: { minutes: Decimalish; invoiceLineId: string | null; retainerId: string | null }[];
};
type ClientInvoiceRow = {
  id: string;
  total: Decimalish;
  status: InvoiceStatus;
  dueDate: Date | null;
};

const PROJECT_HEALTH_SELECT = {
  id: true,
  name: true,
  rate: true,
  projectedHours: true,
  isFlatRate: true,
  clientId: true,
  client: { select: { id: true, name: true } },
  tasks: { select: { isCompleted: true, dueDate: true } },
  timeEntries: { select: { minutes: true, invoiceLineId: true, retainerId: true } },
} as const;

/**
 * Pure assembly of a ProjectHealthInput from already-loaded rows. Shared by the
 * single-project query path and the bulk path so the scoring math lives in one
 * place. `eventsByInvoiceId` maps an invoice id → whether any open event landed.
 */
function assembleProjectHealthInput(
  project: ProjectHealthRow,
  changeOrderTotal: number,
  clientInvoices: ClientInvoiceRow[],
  openedByInvoiceId: Map<string, boolean>,
  now: Date,
): ProjectHealthInput {
  const rate = project.rate.toNumber();
  const effectiveBudget = project.projectedHours * rate + changeOrderTotal;

  const overdueInvoices = clientInvoices.filter(
    (inv) => OVERDUE_STATUSES.includes(inv.status) && inv.dueDate != null && inv.dueDate < now,
  );
  const overdueInvoiceCount = overdueInvoices.length;
  const overdueInvoiceAmount = overdueInvoices.reduce((sum, inv) => sum + inv.total.toNumber(), 0);

  let loggedHours = 0;
  let billableHours = 0;
  let unbilledBillableHours = 0;
  const isBillableProject = !project.isFlatRate && rate > 0;
  for (const entry of project.timeEntries) {
    const hours = entry.minutes.toNumber() / 60;
    loggedHours += hours;
    const isBillable = entry.retainerId != null || isBillableProject;
    if (isBillable) {
      billableHours += hours;
      if (entry.invoiceLineId == null) unbilledBillableHours += hours;
    }
  }
  const loggedValue = loggedHours * rate;

  const totalTasks = project.tasks.length;
  const overdueTasks = project.tasks.filter(
    (t) => !t.isCompleted && t.dueDate != null && t.dueDate < now,
  ).length;

  // Engagement: an invoice counts as "sent" once it has any email event; we only
  // know that here for invoices that appear in openedByInvoiceId.
  let emailsSent = 0;
  let emailsOpened = 0;
  for (const inv of clientInvoices) {
    const opened = openedByInvoiceId.get(inv.id);
    if (opened === undefined) continue;
    emailsSent++;
    if (opened) emailsOpened++;
  }

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
    hasActivity: totalTasks > 0 || loggedHours > 0,
  };
}

/**
 * Build the health-score input for a single project scoped to an org.
 * Returns null when no project is found (or the project belongs to a
 * different org).
 */
// Build the opened-by-invoice map from raw email events. Presence of a key
// means the invoice had at least one event ("sent"); the value is whether any
// of those events was an open.
function buildOpenedMap(events: { invoiceId: string | null; type: string }[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const e of events) {
    if (!e.invoiceId) continue;
    const opened = map.get(e.invoiceId) ?? false;
    map.set(e.invoiceId, opened || e.type === "email.opened");
  }
  return map;
}

export async function buildProjectHealthInput(
  db: typeof Db,
  orgId: string,
  projectId: string,
  now: Date,
): Promise<ProjectHealthInput | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    select: PROJECT_HEALTH_SELECT,
  });

  if (!project) return null;

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

  const invoiceIds = clientInvoices.map((inv) => inv.id);
  const events =
    invoiceIds.length > 0
      ? await db.emailEvent.findMany({
          where: { organizationId: orgId, invoiceId: { in: invoiceIds } },
          select: { invoiceId: true, type: true },
        })
      : [];

  return assembleProjectHealthInput(
    project,
    changeOrderTotal,
    clientInvoices,
    buildOpenedMap(events),
    now,
  );
}

/**
 * Build health-score inputs for all non-archived projects in an org.
 *
 * Bulk-loaded: one query each for projects, change orders, client invoices, and
 * email events — independent of project count — instead of 3–4 round-trips per
 * project. Invoices are fetched per distinct client and shared across that
 * client's projects.
 */
export async function buildProjectHealthInputs(
  db: typeof Db,
  orgId: string,
  now: Date,
): Promise<ProjectHealthInput[]> {
  const projects = (await db.project.findMany({
    where: { organizationId: orgId, status: { not: ProjectStatus.ARCHIVED } },
    select: PROJECT_HEALTH_SELECT,
  })) as ProjectHealthRow[];

  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const clientIds = [...new Set(projects.map((p) => p.clientId))];

  const [changeOrders, clientInvoices] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: orgId,
        projectId: { in: projectIds },
        isChangeOrder: true,
        status: InvoiceStatus.ACCEPTED,
      },
      select: { projectId: true, total: true },
    }),
    db.invoice.findMany({
      where: { organizationId: orgId, clientId: { in: clientIds }, isArchived: false },
      select: { id: true, clientId: true, total: true, status: true, dueDate: true },
    }),
  ]);

  // Change-order total per project.
  const changeOrderTotalByProject = new Map<string, number>();
  for (const co of changeOrders) {
    if (!co.projectId) continue;
    changeOrderTotalByProject.set(
      co.projectId,
      (changeOrderTotalByProject.get(co.projectId) ?? 0) + co.total.toNumber(),
    );
  }

  // Client invoices grouped by client (shared across that client's projects).
  const invoicesByClient = new Map<string, ClientInvoiceRow[]>();
  const allInvoiceIds: string[] = [];
  for (const inv of clientInvoices) {
    const bucket = invoicesByClient.get(inv.clientId) ?? [];
    bucket.push(inv);
    invoicesByClient.set(inv.clientId, bucket);
    allInvoiceIds.push(inv.id);
  }

  const events =
    allInvoiceIds.length > 0
      ? await db.emailEvent.findMany({
          where: { organizationId: orgId, invoiceId: { in: allInvoiceIds } },
          select: { invoiceId: true, type: true },
        })
      : [];
  const openedByInvoiceId = buildOpenedMap(events);

  return projects.map((project) =>
    assembleProjectHealthInput(
      project,
      changeOrderTotalByProject.get(project.id) ?? 0,
      invoicesByClient.get(project.clientId) ?? [],
      openedByInvoiceId,
      now,
    ),
  );
}

/**
 * Automation action execution — the side-effecting half of the engine.
 *
 * The pure engine (`automation-engine.ts`) decides *whether* a rule runs; this
 * module builds the entity snapshot, validates action configs, and *performs*
 * the actions (send email, notify admins). It reuses the same template
 * interpolation as the fixed automations so existing {{ variable }} tokens keep
 * working. The Inngest functions call `runRuleActions` and persist an
 * AutomationRun for dedupe/audit.
 */

import { z } from "zod";
import type { AutomationActionType } from "@/generated/prisma";
import { sendEmail } from "./email-sender";
import { notifyOrgAdmins } from "./notifications";
import { buildTemplateVariables, interpolateTemplate } from "./automation-template";
import { daysOverdue, type AutomationEntity } from "./automation-engine";

// ─── Action config schemas ─────────────────────────────────────────────────────

export const sendEmailConfigSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export const notifyAdminsConfigSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
});

export type SendEmailConfig = z.infer<typeof sendEmailConfigSchema>;
export type NotifyAdminsConfig = z.infer<typeof notifyAdminsConfigSchema>;

/** Validate a raw action config against its type. Throws on invalid shape. */
export function parseActionConfig(type: AutomationActionType, config: unknown): SendEmailConfig | NotifyAdminsConfig {
  switch (type) {
    case "SEND_EMAIL":
      return sendEmailConfigSchema.parse(config);
    case "NOTIFY_ADMINS":
      return notifyAdminsConfigSchema.parse(config);
    default:
      throw new Error(`Unknown automation action type: ${type}`);
  }
}

// ─── Entity snapshot ────────────────────────────────────────────────────────────

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toNumber?: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The invoice shape `buildAutomationEntity` / `runRuleActions` need. */
export interface RunnerInvoice {
  id: string;
  number: string;
  total: unknown; // Prisma Decimal | number
  status: string;
  dueDate: Date | null;
  portalToken: string;
  client: { id: string; name: string; email: string | null };
  organization: { id: string; name: string };
  currency: { code: string };
  payments: { amount: unknown; paidAt: Date }[];
}

/** Build the engine's entity snapshot from a live invoice. */
export function buildAutomationEntity(invoice: RunnerInvoice, now: Date): AutomationEntity {
  const total = toNum(invoice.total);
  const paid = invoice.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
  return {
    total,
    amountDue: Math.max(0, total - paid),
    daysOverdue: daysOverdue(invoice.dueDate, now),
    status: invoice.status,
    clientName: invoice.client.name,
    currencyCode: invoice.currency.code,
  };
}

// ─── Action execution ───────────────────────────────────────────────────────────

export interface RuleActionSpec {
  type: AutomationActionType;
  config: unknown;
}

export interface RunActionsResult {
  status: "executed" | "partial" | "failed";
  actionsRun: number;
  detail?: string;
}

/**
 * Execute every action on a matched rule against the given invoice. Each action
 * is attempted independently so one failure (e.g. a missing client email)
 * doesn't abort the rest; the result reports how many ran and a `partial`/
 * `failed` status when some/all errored.
 */
export async function runRuleActions(
  actions: RuleActionSpec[],
  invoice: RunnerInvoice,
  now: Date,
): Promise<RunActionsResult> {
  const lastPayment = invoice.payments.length
    ? [...invoice.payments].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0]
    : null;

  const vars = buildTemplateVariables({
    clientName: invoice.client.name,
    invoiceNumber: invoice.number,
    amountDue: toNum(invoice.total).toFixed(2),
    dueDate: invoice.dueDate?.toLocaleDateString() ?? "",
    portalToken: invoice.portalToken,
    orgName: invoice.organization.name,
    amountPaid: lastPayment ? toNum(lastPayment.amount).toFixed(2) : "",
    paymentDate: lastPayment?.paidAt?.toLocaleDateString() ?? "",
  });

  let ran = 0;
  const failures: string[] = [];

  for (const action of actions) {
    try {
      await executeAction(action, invoice, vars);
      ran++;
    } catch (err) {
      failures.push(`${action.type}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const status: RunActionsResult["status"] =
    failures.length === 0 ? "executed" : ran > 0 ? "partial" : "failed";

  // `now` is part of the public signature for symmetry with the engine and to
  // let callers thread a fixed clock in tests; the template already captured it.
  void now;
  return {
    status,
    actionsRun: ran,
    detail: failures.length > 0 ? failures.join("; ") : undefined,
  };
}

async function executeAction(
  action: RuleActionSpec,
  invoice: RunnerInvoice,
  vars: ReturnType<typeof buildTemplateVariables>,
): Promise<void> {
  if (action.type === "SEND_EMAIL") {
    const cfg = sendEmailConfigSchema.parse(action.config);
    if (!invoice.client.email) throw new Error("client has no email");
    await sendEmail({
      organizationId: invoice.organization.id,
      clientId: invoice.client.id,
      emailKind: "AUTOMATIONS",
      to: invoice.client.email,
      subject: interpolateTemplate(cfg.subject, vars),
      html: interpolateTemplate(cfg.body, vars),
      invoiceId: invoice.id,
    });
    return;
  }

  if (action.type === "NOTIFY_ADMINS") {
    const cfg = notifyAdminsConfigSchema.parse(action.config);
    await notifyOrgAdmins(invoice.organization.id, {
      type: "AUTOMATION_TRIGGERED",
      title: interpolateTemplate(cfg.title, vars),
      body: interpolateTemplate(cfg.body, vars),
      link: `/invoices/${invoice.id}`,
    });
    return;
  }

  throw new Error(`Unknown automation action type: ${action.type as string}`);
}

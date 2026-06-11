/**
 * No-code automation builder — Inngest execution.
 *
 * Two entry points, both backed by the same evaluator:
 *   • handleAutomationRuleEvent — real-time, on invoice lifecycle events
 *     (sent / viewed / payment received). Mirrors the fixed-automation event
 *     listener but routes through the generalized rule engine.
 *   • processAutomationRules — a daily sweep for INVOICE_OVERDUE rules, which
 *     have no discrete event (overdue status is computed by a cron).
 *
 * Each matched (rule, invoice) pair runs at most once: AutomationRun has a unique
 * (ruleId, invoiceId) constraint, the same double-send guard the old
 * EmailAutomationLog used.
 */

import { inngest } from "../client";
import { db } from "@/server/db";
import type { AutomationTrigger, Prisma } from "@/generated/prisma";
import {
  ruleShouldRun,
  type EvaluableRule,
  type RuleCondition,
} from "@/server/services/automation-engine";
import {
  buildAutomationEntity,
  runRuleActions,
  type RunnerInvoice,
} from "@/server/services/automation-runner";

const EVENT_TO_TRIGGER: Record<string, AutomationTrigger> = {
  "invoice/payment.received": "PAYMENT_RECEIVED",
  "invoice/sent": "INVOICE_SENT",
  "invoice/viewed": "INVOICE_VIEWED",
};

// Rule with its conditions + actions, as loaded from the DB.
type LoadedRule = Prisma.AutomationRuleGetPayload<{
  include: { conditions: true; actions: true };
}>;

const INVOICE_INCLUDE = {
  client: { select: { id: true, name: true, email: true } },
  organization: { select: { id: true, name: true } },
  currency: { select: { code: true } },
  payments: { select: { amount: true, paidAt: true } },
} satisfies Prisma.InvoiceInclude;

type LoadedInvoice = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

function toRunnerInvoice(invoice: LoadedInvoice): RunnerInvoice {
  return {
    id: invoice.id,
    number: invoice.number,
    total: invoice.total,
    status: invoice.status,
    dueDate: invoice.dueDate,
    portalToken: invoice.portalToken,
    client: invoice.client,
    organization: invoice.organization,
    currency: invoice.currency,
    payments: invoice.payments,
  };
}

function toEvaluableRule(rule: LoadedRule): EvaluableRule {
  return {
    trigger: rule.trigger,
    conditionLogic: rule.conditionLogic,
    conditions: rule.conditions
      .sort((a, b) => a.sort - b.sort)
      .map<RuleCondition>((c) => ({ field: c.field, operator: c.operator, value: c.value })),
  };
}

interface RunStats {
  matched: number;
  ran: number;
  skipped: number;
  failed: number;
}

/**
 * Core evaluator: for one invoice and a set of candidate rules (already filtered
 * to the invoice's org + the fired trigger), run every rule whose conditions
 * pass and that hasn't already run for this invoice.
 */
export async function evaluateRulesForInvoice(
  rules: LoadedRule[],
  invoice: LoadedInvoice,
  firedTrigger: AutomationTrigger,
  now: Date,
  stats: RunStats,
): Promise<void> {
  if (rules.length === 0) return;

  const runnerInvoice = toRunnerInvoice(invoice);
  const entity = buildAutomationEntity(runnerInvoice, now);

  // One query for all existing runs on this invoice across the candidate rules.
  const existing = await db.automationRun.findMany({
    where: { invoiceId: invoice.id, ruleId: { in: rules.map((r) => r.id) } },
    select: { ruleId: true },
  });
  const alreadyRan = new Set(existing.map((e) => e.ruleId));

  for (const rule of rules) {
    if (!ruleShouldRun(toEvaluableRule(rule), firedTrigger, entity)) {
      stats.skipped++;
      continue;
    }
    if (alreadyRan.has(rule.id)) {
      stats.skipped++;
      continue;
    }

    stats.matched++;
    const sortedActions = [...rule.actions].sort((a, b) => a.sort - b.sort);
    const result = await runRuleActions(
      sortedActions.map((a) => ({ type: a.type, config: a.config })),
      runnerInvoice,
      now,
    );

    try {
      // The unique (ruleId, invoiceId) constraint is the real dedupe guard
      // against a concurrent run racing past the pre-check above.
      await db.automationRun.create({
        data: {
          ruleId: rule.id,
          invoiceId: invoice.id,
          status: result.status,
          actionsRun: result.actionsRun,
          detail: result.detail,
        },
      });
    } catch {
      stats.skipped++;
      continue;
    }

    if (result.status === "failed") stats.failed++;
    else stats.ran++;
  }
}

export const handleAutomationRuleEvent = inngest.createFunction(
  {
    id: "handle-automation-rule-event",
    name: "Handle Automation Rule Event",
    triggers: [
      { event: "invoice/payment.received" },
      { event: "invoice/sent" },
      { event: "invoice/viewed" },
    ],
  },
  async ({ event }) => {
    const trigger = EVENT_TO_TRIGGER[event.name];
    if (!trigger) return { reason: "unknown_event" };

    const { invoiceId } = event.data as { invoiceId: string };
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return { reason: "no_invoice" };

    const rules = await db.automationRule.findMany({
      where: { organizationId: invoice.organizationId, trigger, enabled: true },
      include: { conditions: true, actions: true },
    });

    const stats: RunStats = { matched: 0, ran: 0, skipped: 0, failed: 0 };
    await evaluateRulesForInvoice(rules, invoice, trigger, new Date(), stats);
    return stats;
  },
);

export const processAutomationRules = inngest.createFunction(
  { id: "process-automation-rules", name: "Process Automation Rules (Overdue)", triggers: [{ cron: "0 9 * * *" }] },
  async () => {
    const now = new Date();
    const stats: RunStats = { matched: 0, ran: 0, skipped: 0, failed: 0 };

    const rules = await db.automationRule.findMany({
      where: { trigger: "INVOICE_OVERDUE", enabled: true },
      include: { conditions: true, actions: true },
    });
    if (rules.length === 0) return { ...stats, rules: 0 };

    const orgIds = [...new Set(rules.map((r) => r.organizationId))];
    const invoices = await db.invoice.findMany({
      where: { organizationId: { in: orgIds }, isArchived: false, status: "OVERDUE" },
      include: INVOICE_INCLUDE,
    });

    const rulesByOrg = new Map<string, LoadedRule[]>();
    for (const rule of rules) {
      const list = rulesByOrg.get(rule.organizationId) ?? [];
      list.push(rule);
      rulesByOrg.set(rule.organizationId, list);
    }

    for (const invoice of invoices) {
      const orgRules = rulesByOrg.get(invoice.organizationId) ?? [];
      await evaluateRulesForInvoice(orgRules, invoice, "INVOICE_OVERDUE", now, stats);
    }

    return { ...stats, rules: rules.length };
  },
);

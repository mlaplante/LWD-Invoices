/**
 * Credit limit / credit hold per client.
 *
 * Two connected ideas:
 *  1. A per-client credit limit on open AR (sum of unpaid invoice balances).
 *  2. An automatic credit hold that trips when the client-health score you
 *     already compute drops below a per-client threshold — wiring the health
 *     core directly into collections.
 *
 * Holds are advisory (warn-only): the UI surfaces a prominent banner before you
 * send an invoice or charge a card, but nothing is hard-blocked. Auto-holds are
 * released automatically once the score recovers; manual holds need an admin.
 *
 * `getClientCreditStatus` is the read model the client UI + invoice-send guard
 * consume; `evaluateAutoCreditHolds` is the cron-driven trigger.
 */

import type { db as Db } from "../db";
import { OPEN_STATUSES, toNum } from "./analytics-data";
import { buildClientHealthInputs } from "./analytics-data";
import { calculateClientHealthScores } from "./client-health-score";

export interface ClientCreditStatus {
  clientId: string;
  /** Open AR exposure: sum of unpaid balances across open invoices. */
  exposure: number;
  creditLimit: number | null;
  /** exposure - creditLimit when over (positive), else 0. */
  overLimitBy: number;
  isOverLimit: boolean;
  creditHold: boolean;
  creditHoldAuto: boolean;
  creditHoldReason: string | null;
  creditHoldSetAt: Date | null;
  autoCreditHoldEnabled: boolean;
  autoCreditHoldThreshold: number | null;
  /** Latest health score (0-100), or null when the client has no history yet. */
  healthScore: number | null;
  /** True when anything warrants surfacing a warning (hold OR over-limit). */
  shouldWarn: boolean;
}

async function computeExposure(
  db: typeof Db,
  orgId: string,
  clientId: string,
): Promise<number> {
  const open = await db.invoice.findMany({
    where: {
      organizationId: orgId,
      clientId,
      isArchived: false,
      status: { in: OPEN_STATUSES },
    },
    select: { total: true, payments: { select: { amount: true } } },
  });
  let exposure = 0;
  for (const inv of open) {
    const paid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
    exposure += Math.max(0, toNum(inv.total) - paid);
  }
  return Math.round(exposure * 100) / 100;
}

export async function getClientCreditStatus(
  db: typeof Db,
  orgId: string,
  clientId: string,
  healthScore?: number | null,
): Promise<ClientCreditStatus> {
  const client = await db.client.findFirst({
    where: { id: clientId, organizationId: orgId },
    select: {
      id: true,
      creditLimit: true,
      creditHold: true,
      creditHoldAuto: true,
      creditHoldReason: true,
      creditHoldSetAt: true,
      autoCreditHoldEnabled: true,
      autoCreditHoldThreshold: true,
    },
  });
  if (!client) {
    throw new Error("Client not found");
  }

  const exposure = await computeExposure(db, orgId, clientId);
  const creditLimit = client.creditLimit !== null ? toNum(client.creditLimit) : null;
  const overLimitBy =
    creditLimit !== null && exposure > creditLimit
      ? Math.round((exposure - creditLimit) * 100) / 100
      : 0;
  const isOverLimit = overLimitBy > 0;

  return {
    clientId: client.id,
    exposure,
    creditLimit,
    overLimitBy,
    isOverLimit,
    creditHold: client.creditHold,
    creditHoldAuto: client.creditHoldAuto,
    creditHoldReason: client.creditHoldReason,
    creditHoldSetAt: client.creditHoldSetAt,
    autoCreditHoldEnabled: client.autoCreditHoldEnabled,
    autoCreditHoldThreshold: client.autoCreditHoldThreshold,
    healthScore: healthScore ?? null,
    shouldWarn: client.creditHold || isOverLimit,
  };
}

export interface AutoHoldResult {
  evaluated: number;
  held: number;
  released: number;
  changes: {
    clientId: string;
    clientName: string;
    action: "held" | "released";
    score: number;
    threshold: number;
  }[];
}

/**
 * Evaluate auto-credit-hold policy for every client in an org that has it
 * enabled. Places an auto-hold when the health score falls below the client's
 * threshold; releases a previously auto-placed hold once the score recovers.
 * Manual holds are never touched.
 */
export async function evaluateAutoCreditHolds(
  db: typeof Db,
  orgId: string,
  now: Date = new Date(),
): Promise<AutoHoldResult> {
  const policyClients = await db.client.findMany({
    where: {
      organizationId: orgId,
      isArchived: false,
      autoCreditHoldEnabled: true,
      autoCreditHoldThreshold: { not: null },
    },
    select: {
      id: true,
      name: true,
      creditHold: true,
      creditHoldAuto: true,
      autoCreditHoldThreshold: true,
    },
  });

  const result: AutoHoldResult = { evaluated: 0, held: 0, released: 0, changes: [] };
  if (policyClients.length === 0) return result;

  // Score the whole org once, then index by client.
  const inputs = await buildClientHealthInputs(db, orgId, now);
  const scores = calculateClientHealthScores(inputs);
  const scoreByClient = new Map(scores.map((s) => [s.clientId, s.score]));

  for (const client of policyClients) {
    const threshold = client.autoCreditHoldThreshold!;
    const score = scoreByClient.get(client.id);
    if (score === undefined) continue; // no history to score yet
    result.evaluated++;

    if (score < threshold && !client.creditHold) {
      await db.client.update({
        where: { id: client.id },
        data: {
          creditHold: true,
          creditHoldAuto: true,
          creditHoldReason: `Auto hold: health score ${score} fell below threshold ${threshold}.`,
          creditHoldSetAt: now,
        },
      });
      result.held++;
      result.changes.push({ clientId: client.id, clientName: client.name, action: "held", score, threshold });
    } else if (score >= threshold && client.creditHold && client.creditHoldAuto) {
      // Recovered — release the auto-hold (leave manual holds alone).
      await db.client.update({
        where: { id: client.id },
        data: {
          creditHold: false,
          creditHoldAuto: false,
          creditHoldReason: null,
          creditHoldSetAt: null,
        },
      });
      result.released++;
      result.changes.push({ clientId: client.id, clientName: client.name, action: "released", score, threshold });
    }
  }

  return result;
}

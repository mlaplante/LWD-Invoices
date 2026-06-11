import type { PrismaClient } from "@/generated/prisma";

/**
 * Cross-instance webhook idempotency backed by the WebhookDelivery table.
 *
 * `markProcessed` records a delivery AFTER successful processing — same
 * semantics as the in-memory maps it backs up: a handler that throws mid-way
 * is retried by the provider and re-processed (handlers stay idempotent at
 * the DB-transaction level for that case). `wasProcessed` is the cheap
 * skip-check at the top of a handler.
 */

// Providers give up retrying within hours; 3 days leaves a wide margin while
// keeping the table small.
const PRUNE_AFTER_MS = 3 * 24 * 60 * 60_000;
// Prune on ~1% of writes so cleanup needs no dedicated cron.
const PRUNE_PROBABILITY = 0.01;

export async function wasProcessed(
  db: Pick<PrismaClient, "webhookDelivery">,
  provider: string,
  externalId: string,
): Promise<boolean> {
  const existing = await db.webhookDelivery.findUnique({
    where: { provider_externalId: { provider, externalId } },
    select: { id: true },
  });
  return existing !== null;
}

export async function markProcessed(
  db: Pick<PrismaClient, "webhookDelivery">,
  provider: string,
  externalId: string,
): Promise<void> {
  try {
    await db.webhookDelivery.create({ data: { provider, externalId } });
  } catch (error) {
    // P2002: another replica recorded the same delivery between our check and
    // this insert — the work is done either way.
    if (!isUniqueConstraintError(error)) throw error;
  }

  if (Math.random() < PRUNE_PROBABILITY) {
    const cutoff = new Date(Date.now() - PRUNE_AFTER_MS);
    await db.webhookDelivery
      .deleteMany({ where: { processedAt: { lt: cutoff } } })
      .catch(() => undefined);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

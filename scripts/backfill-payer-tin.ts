/**
 * One-time backfill: move existing plaintext Organization.payerTin values into
 * the encrypted columns (payerTinEncrypted + payerTinLast4) and null out the
 * legacy plaintext column.
 *
 * Idempotent: only touches rows that still have a non-null payerTin and no
 * payerTinEncrypted yet, so re-running is safe.
 *
 * Run against the real database (the sandbox has none — see lwd-change-control
 * Gate 5). Requires GATEWAY_ENCRYPTION_KEY(S) and DATABASE_URL in the env:
 *
 *   GATEWAY_ENCRYPTION_KEYS=... DATABASE_URL=... npx tsx scripts/backfill-payer-tin.ts
 *
 * After this reports 0 remaining plaintext rows in production, a follow-up
 * migration can safely `ALTER TABLE "Organization" DROP COLUMN "payerTin"`.
 */
import { PrismaClient } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptString } from "../src/server/services/encryption";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const rows = await db.organization.findMany({
    where: { payerTin: { not: null }, payerTinEncrypted: null },
    select: { id: true, payerTin: true },
  });

  console.log(`Found ${rows.length} organization(s) with legacy plaintext payerTin.`);

  let migrated = 0;
  for (const row of rows) {
    const digits = (row.payerTin ?? "").replace(/\D/g, "");
    if (!digits) {
      // Non-numeric junk — just clear it.
      await db.organization.update({ where: { id: row.id }, data: { payerTin: null } });
      continue;
    }
    await db.organization.update({
      where: { id: row.id },
      data: {
        payerTinEncrypted: encryptString(digits),
        payerTinLast4: digits.slice(-4),
        payerTin: null,
      },
    });
    migrated++;
  }

  const remaining = await db.organization.count({ where: { payerTin: { not: null } } });
  console.log(`Encrypted ${migrated} row(s). Remaining plaintext payerTin rows: ${remaining}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

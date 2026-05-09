import type { PrismaClient } from "@/generated/prisma";
import { getOrgTaxMap, type TaxInput } from "../services/tax-calculator";

/**
 * Resolve a list of tax IDs against the org's tax map, dropping ids that
 * no longer exist (e.g. a tax was deleted after a line was saved).
 *
 * Used in invoice line recalculation when only the assigned tax IDs are
 * stored on each line and we need to look up the full TaxInput records.
 */
export function buildTaxInputs(
  taxMap: Map<string, TaxInput>,
  taxIds: string[],
): TaxInput[] {
  return taxIds.flatMap((id) => {
    const tax = taxMap.get(id);
    return tax ? [tax] : [];
  });
}

/**
 * List form of getOrgTaxMap for callers that want every org tax as an
 * array — e.g. computing invoice totals where every tax may apply.
 */
export async function getOrgTaxList(
  db: PrismaClient,
  orgId: string,
): Promise<TaxInput[]> {
  const map = await getOrgTaxMap(db, orgId);
  return Array.from(map.values());
}

export { getOrgTaxMap, type TaxInput };

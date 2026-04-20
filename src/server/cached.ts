import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { db } from "./db";

/**
 * Cross-request cache for org-scoped reads that rarely change.
 *
 * Intentionally scoped to tables *without* Prisma Decimal columns — the
 * Next.js data cache serializes values via JSON, which drops Decimal prototype
 * methods on the way back out. If you need to cache a model with Decimal, map
 * to a plain-number shape before caching.
 *
 * Invalidation is tag-based. On mutation, call revalidateTag(orgTag(...)).
 */

export const orgTag = (orgId: string, resource: string) => `org:${orgId}:${resource}`;

const ONE_HOUR = 60 * 60;

export const getTaskStatusesForOrg = (orgId: string) =>
  unstable_cache(
    async () =>
      db.taskStatus.findMany({
        where: { organizationId: orgId },
        orderBy: { sortOrder: "asc" },
      }),
    ["taskStatuses", orgId],
    { tags: [orgTag(orgId, "taskStatuses")], revalidate: ONE_HOUR }
  )();

export const getExpenseCategoriesForOrg = (orgId: string) =>
  unstable_cache(
    async () =>
      db.expenseCategory.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      }),
    ["expenseCategories", orgId],
    { tags: [orgTag(orgId, "expenseCategories")], revalidate: ONE_HOUR }
  )();

export const getExpenseSuppliersForOrg = (orgId: string) =>
  unstable_cache(
    async () =>
      db.expenseSupplier.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      }),
    ["expenseSuppliers", orgId],
    { tags: [orgTag(orgId, "expenseSuppliers")], revalidate: ONE_HOUR }
  )();

export function invalidateOrg(orgId: string, ...resources: string[]) {
  // Next 16: revalidateTag requires a cacheLife profile. { expire: 0 } forces
  // immediate purge so the next read refetches.
  for (const r of resources) revalidateTag(orgTag(orgId, r), { expire: 0 });
}

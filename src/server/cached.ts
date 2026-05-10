import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import type { GatewayType, PrismaClient } from "@/generated/prisma";

/**
 * Cross-request cache for org-scoped reads that rarely change.
 *
 * Intentionally scoped to tables *without* Prisma Decimal columns — the
 * Next.js data cache serializes values via JSON, which drops Decimal prototype
 * methods on the way back out. If you need to cache a model with Decimal, map
 * to a plain-number shape before caching.
 *
 * Invalidation is tag-based. On mutation, call revalidateTag(orgTag(...)).
 *
 * Each helper takes the Prisma client as its first argument so callers
 * (including tests with a mocked client) supply the same instance they
 * use for writes — no implicit dependency on a singleton.
 */

export const orgTag = (orgId: string, resource: string) => `org:${orgId}:${resource}`;

const ONE_HOUR = 60 * 60;

export const getTaskStatusesForOrg = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async () =>
      db.taskStatus.findMany({
        where: { organizationId: orgId },
        orderBy: { sortOrder: "asc" },
      }),
    ["taskStatuses", orgId],
    { tags: [orgTag(orgId, "taskStatuses")], revalidate: ONE_HOUR }
  )();

export const getExpenseCategoriesForOrg = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async () =>
      db.expenseCategory.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      }),
    ["expenseCategories", orgId],
    { tags: [orgTag(orgId, "expenseCategories")], revalidate: ONE_HOUR }
  )();

export const getExpenseSuppliersForOrg = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async () =>
      db.expenseSupplier.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      }),
    ["expenseSuppliers", orgId],
    { tags: [orgTag(orgId, "expenseSuppliers")], revalidate: ONE_HOUR }
  )();

export const getEmailAutomationsForOrg = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async () =>
      db.emailAutomation.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
      }),
    ["emailAutomations", orgId],
    { tags: [orgTag(orgId, "emailAutomations")], revalidate: ONE_HOUR }
  )();

export const getProposalTemplatesForOrg = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async () =>
      db.proposalTemplate.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
      }),
    ["proposalTemplates", orgId],
    { tags: [orgTag(orgId, "proposalTemplates")], revalidate: ONE_HOUR }
  )();

// ─── Decimal-bearing models (mapped to plain numbers before caching) ──────────

export type CachedTax = { id: string; name: string; rate: number; isCompound: boolean; isDefault: boolean };
export type CachedCurrency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  symbolPosition: string;
  exchangeRate: number;
  isDefault: boolean;
};
export type CachedGateway = {
  id: string;
  gatewayType: GatewayType;
  isEnabled: boolean;
  configJson: string;
  surcharge: number;
  label: string | null;
};

export const getTaxesForOrg = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async (): Promise<CachedTax[]> => {
      const taxes = await db.tax.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "asc" },
      });
      return taxes.map((t) => ({
        id: t.id,
        name: t.name,
        rate: t.rate.toNumber(),
        isCompound: t.isCompound,
        isDefault: t.isDefault,
      }));
    },
    ["taxes", orgId],
    { tags: [orgTag(orgId, "taxes")], revalidate: ONE_HOUR }
  )();

export const getCurrenciesForOrg = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async (): Promise<CachedCurrency[]> => {
      const currencies = await db.currency.findMany({
        where: { organizationId: orgId },
        orderBy: { code: "asc" },
      });
      return currencies.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        symbolPosition: c.symbolPosition,
        exchangeRate: c.exchangeRate.toNumber(),
        isDefault: c.isDefault,
      }));
    },
    ["currencies", orgId],
    { tags: [orgTag(orgId, "currencies")], revalidate: ONE_HOUR }
  )();

export const getGatewaysForOrg = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async (): Promise<CachedGateway[]> => {
      const gateways = await db.gatewaySetting.findMany({
        where: { organizationId: orgId },
        orderBy: { gatewayType: "asc" },
      });
      return gateways.map((g) => ({
        id: g.id,
        gatewayType: g.gatewayType,
        isEnabled: g.isEnabled,
        configJson: g.configJson,
        surcharge: g.surcharge.toNumber(),
        label: g.label,
      }));
    },
    ["gateways", orgId],
    { tags: [orgTag(orgId, "gateways")], revalidate: ONE_HOUR }
  )();

// Org branding/portal fields used on every public portal/pay page render.
// No Decimal columns in this projection, so we cache the raw select.
export const getOrgBranding = (db: PrismaClient, orgId: string) =>
  unstable_cache(
    async () =>
      db.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          logoUrl: true,
          brandColor: true,
          brandFont: true,
          hidePoweredBy: true,
          portalTagline: true,
          portalFooterText: true,
          invoiceTemplate: true,
          invoiceFontFamily: true,
          invoiceAccentColor: true,
          invoiceShowLogo: true,
          invoiceFooterText: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      }),
    ["orgBranding", orgId],
    { tags: [orgTag(orgId, "branding")], revalidate: ONE_HOUR * 24 }
  )();

export function invalidateOrg(orgId: string, ...resources: string[]) {
  // Next 16: revalidateTag requires a cacheLife profile. { expire: 0 } forces
  // immediate purge so the next read refetches.
  for (const r of resources) revalidateTag(orgTag(orgId, r), { expire: 0 });
}

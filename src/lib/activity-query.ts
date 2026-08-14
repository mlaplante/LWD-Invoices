import type { AuditAction } from "@/generated/prisma";
import type { ActivityFilter } from "@/components/activity/ActivityFilters";

/**
 * Shared between the activity page's server shell and its client component.
 *
 * The server prefetches and the client subscribes with what must be the *same*
 * tRPC input, or the query keys diverge and the hydrated result is discarded.
 * Keeping the shape in one builder means the two sides cannot drift apart in a
 * later edit — which is the failure mode, because a mismatch is silent.
 */

export const ACTIVITY_PAGE_SIZE = 50;

export const EMPTY_ACTIVITY_FILTER: ActivityFilter = {
  entityTypes: [],
  action: "",
  from: "",
  to: "",
};

export function buildActivityQueryArgs(filter: ActivityFilter, offset: number) {
  return {
    entityTypes: filter.entityTypes.length > 0 ? filter.entityTypes : undefined,
    action: filter.action ? (filter.action as AuditAction) : undefined,
    from: filter.from ? new Date(filter.from) : undefined,
    to: filter.to ? new Date(filter.to) : undefined,
    limit: ACTIVITY_PAGE_SIZE,
    offset,
  };
}

/**
 * The exact input the page renders with before any user interaction — the only
 * state worth prefetching, since filters and pagination are user-driven.
 */
export const INITIAL_ACTIVITY_QUERY_ARGS = buildActivityQueryArgs(
  EMPTY_ACTIVITY_FILTER,
  0
);

"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ActivityFilters, type ActivityFilter } from "@/components/activity/ActivityFilters";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import {
  ACTIVITY_PAGE_SIZE,
  EMPTY_ACTIVITY_FILTER,
  buildActivityQueryArgs,
} from "@/lib/activity-query";

export function ActivityPageClient() {
  const [filter, setFilter] = useState<ActivityFilter>(EMPTY_ACTIVITY_FILTER);
  const [offset, setOffset] = useState(0);

  // Same builder the server shell uses for its prefetch, so the initial render's
  // query key matches the hydrated entry exactly. Once the user touches a filter
  // or pages forward the key legitimately changes and we fetch, as intended.
  const queryArgs = buildActivityQueryArgs(filter, offset);

  const { data: items = [], isFetching } = trpc.auditLog.list.useQuery(queryArgs);

  function handleFilterChange(next: ActivityFilter) {
    setFilter(next);
    setOffset(0); // reset pagination on filter change
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
          <Activity className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Activity</h1>
          <p className="text-sm text-muted-foreground">Recent changes across your organization</p>
        </div>
      </div>

      {/* Filters */}
      <ActivityFilters filter={filter} onChange={handleFilterChange} />

      {/* Feed */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        {isFetching && items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <ActivityFeed items={items} linkItems />
        )}
      </div>

      {/* Load more */}
      {items.length === ACTIVITY_PAGE_SIZE && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((o) => o + ACTIVITY_PAGE_SIZE)}
            disabled={isFetching}
          >
            {isFetching ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

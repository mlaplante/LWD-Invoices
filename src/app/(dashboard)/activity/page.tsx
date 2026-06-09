"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ActivityFilters, type ActivityFilter } from "@/components/activity/ActivityFilters";
import { Button } from "@/components/ui/button";
import { AuditAction } from "@/generated/prisma";
import { Activity } from "lucide-react";

const PAGE_SIZE = 50;

const EMPTY_FILTER: ActivityFilter = {
  entityTypes: [],
  action: "",
  from: "",
  to: "",
};

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityFilter>(EMPTY_FILTER);
  const [offset, setOffset] = useState(0);

  // Build query args from filter state
  const queryArgs = {
    entityTypes: filter.entityTypes.length > 0 ? filter.entityTypes : undefined,
    action: filter.action ? (filter.action as AuditAction) : undefined,
    from: filter.from ? new Date(filter.from) : undefined,
    to: filter.to ? new Date(filter.to) : undefined,
    limit: PAGE_SIZE,
    offset,
  };

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
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isFetching && items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <ActivityFeed items={items} linkItems />
        )}
      </div>

      {/* Load more */}
      {items.length === PAGE_SIZE && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={isFetching}
          >
            {isFetching ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

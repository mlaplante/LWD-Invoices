"use client";

import { X } from "lucide-react";

export type ActivityFilter = {
  entityTypes: string[];
  action: string;
  from: string;
  to: string;
};

const ENTITY_TYPES = [
  "Invoice",
  "Client",
  "Project",
  "Ticket",
  "Payment",
  "PartialPayment",
  "Expense",
  "CreditNote",
  "Contractor",
  "Dispute",
] as const;

const ACTIONS = [
  { value: "", label: "All actions" },
  { value: "CREATED", label: "Created" },
  { value: "UPDATED", label: "Updated" },
  { value: "SENT", label: "Sent" },
  { value: "PAYMENT_RECEIVED", label: "Payment received" },
  { value: "STATUS_CHANGED", label: "Status changed" },
  { value: "VIEWED", label: "Viewed" },
  { value: "DELETED", label: "Deleted" },
] as const;

type Props = {
  filter: ActivityFilter;
  onChange: (filter: ActivityFilter) => void;
};

export function ActivityFilters({ filter, onChange }: Props) {
  function toggleEntityType(type: string) {
    const next = filter.entityTypes.includes(type)
      ? filter.entityTypes.filter((t) => t !== type)
      : [...filter.entityTypes, type];
    onChange({ ...filter, entityTypes: next });
  }

  function clearAll() {
    onChange({ entityTypes: [], action: "", from: "", to: "" });
  }

  const hasFilter =
    filter.entityTypes.length > 0 || filter.action || filter.from || filter.to;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Entity type multi-select chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ENTITY_TYPES.map((type) => {
          const active = filter.entityTypes.includes(type);
          return (
            <button
              key={type}
              onClick={() => toggleEntityType(type)}
              className={[
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
              ].join(" ")}
            >
              {type}
            </button>
          );
        })}
      </div>

      {/* Action dropdown */}
      <select
        value={filter.action}
        onChange={(e) => onChange({ ...filter, action: e.target.value })}
        className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Filter by action"
      >
        {ACTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={filter.from}
          onChange={(e) => onChange({ ...filter, from: e.target.value })}
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="date"
          value={filter.to}
          onChange={(e) => onChange({ ...filter, to: e.target.value })}
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="To date"
        />
      </div>

      {/* Clear all */}
      {hasFilter && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors"
          aria-label="Clear all filters"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

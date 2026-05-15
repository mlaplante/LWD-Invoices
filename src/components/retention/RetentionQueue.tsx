"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { TOUCH_TYPE_LABELS } from "@/server/services/check-in-templates";
import { formatDistanceToNow } from "date-fns";
import { CheckInDrawer } from "./CheckInDrawer";
import { Inbox, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { ClientCheckInStatus, ClientCheckInTouchType } from "@/generated/prisma";

const TOUCH_TYPES: ClientCheckInTouchType[] = ["PROJECT_CLOSE", "THIRTY_DAY", "QUARTERLY", "ANNUAL"];
const STATUSES: { key: ClientCheckInStatus; label: string; icon: typeof Inbox }[] = [
  { key: "PENDING", label: "Pending", icon: Inbox },
  { key: "COMPLETED", label: "Completed", icon: CheckCircle2 },
  { key: "DISMISSED", label: "Dismissed", icon: XCircle },
];

export function RetentionQueue() {
  const [status, setStatus] = useState<ClientCheckInStatus>("PENDING");
  const [touchType, setTouchType] = useState<ClientCheckInTouchType | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: settings } = trpc.checkInTemplates.getSettings.useQuery();
  const { data: items = [], isLoading } = trpc.clientCheckIns.list.useQuery({
    status,
    touchType: touchType === "ALL" ? undefined : touchType,
  });

  if (settings && !settings.retentionEnabled) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
        <Inbox className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-base font-semibold">Retention automation is off</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          Enable it in settings to start surfacing weekly check-in reminders for
          past clients.
        </p>
        <Button asChild className="mt-4" size="sm">
          <a href="/settings/retention">Open retention settings</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-muted/40 p-1">
          {STATUSES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setStatus(s.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  status === s.key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All touches"
            active={touchType === "ALL"}
            onClick={() => setTouchType("ALL")}
          />
          {TOUCH_TYPES.map((t) => (
            <FilterChip
              key={t}
              label={TOUCH_TYPE_LABELS[t]}
              active={touchType === t}
              onClick={() => setTouchType(t)}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Inbox className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {status === "PENDING"
                ? "Nothing in the queue. Check back next Monday."
                : `No ${status.toLowerCase()} check-ins.`}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setSelectedId(item.id)}
                  className="w-full text-left px-5 py-4 hover:bg-accent/30 transition-colors flex items-start gap-3"
                >
                  <span className="mt-0.5">
                    <TouchTypeBadge touchType={item.touchType} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.client.name}</p>
                    {item.project && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {item.project.name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    {item.status === "COMPLETED" && item.outcome && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                        {item.outcome.replace("_", " ").toLowerCase()}
                      </span>
                    )}
                    <Clock className="w-3 h-3" />
                    <span>
                      {item.status === "PENDING"
                        ? `due ${formatDistanceToNow(new Date(item.dueAt), { addSuffix: true })}`
                        : formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CheckInDrawer
        checkInId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {label}
    </button>
  );
}

const TOUCH_TYPE_COLORS: Record<ClientCheckInTouchType, string> = {
  PROJECT_CLOSE: "bg-rose-100 text-rose-700",
  THIRTY_DAY: "bg-amber-100 text-amber-700",
  QUARTERLY: "bg-blue-100 text-blue-700",
  ANNUAL: "bg-violet-100 text-violet-700",
};

function TouchTypeBadge({ touchType }: { touchType: ClientCheckInTouchType }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${TOUCH_TYPE_COLORS[touchType]}`}
    >
      {TOUCH_TYPE_LABELS[touchType]}
    </span>
  );
}

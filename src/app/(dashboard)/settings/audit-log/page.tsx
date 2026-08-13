import { api } from "@/trpc/server";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Action badge config ────────────────────────────────────────────────────────

const ACTION_BADGE: Record<string, { label: string; className: string }> = {
  CREATED:          { label: "Created",        className: "bg-success/10 text-success-foreground" },
  UPDATED:          { label: "Updated",        className: "bg-warning/12 text-warning-foreground" },
  DELETED:          { label: "Deleted",        className: "bg-danger/10 text-danger-foreground" },
  STATUS_CHANGED:   { label: "Status Changed", className: "bg-primary/10 text-primary" },
  PAYMENT_RECEIVED: { label: "Payment",        className: "bg-success/10 text-success-foreground" },
  SENT:             { label: "Sent",           className: "bg-accent text-accent-foreground" },
  VIEWED:           { label: "Viewed",         className: "bg-muted text-muted-foreground" },
};

const DEFAULT_BADGE = { label: "Action", className: "bg-muted text-muted-foreground" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AuditLogPage() {
  const logs = await api.auditLog.list({ limit: 50 });

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight truncate">
          Activity Log
        </h1>
      </div>

      {/* Log card */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <p className="eyebrow lowercase text-[11px]">
            Audit Trail
          </p>
          <p className="text-base font-semibold mt-1">Activity Log</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            A history of all actions performed in your organization.
          </p>
        </div>

        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm font-medium text-muted-foreground">No activity recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {logs.map((log) => {
              const badge = ACTION_BADGE[log.action] ?? DEFAULT_BADGE;
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-6 py-3.5 hover:bg-accent/20 transition-colors text-sm"
                >
                  <span
                    className={cn(
                      "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0",
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                  <span className="text-muted-foreground shrink-0">{log.entityType}</span>
                  <span className="font-medium truncate">{log.entityLabel ?? log.entityId}</span>
                  {log.userLabel && (
                    <span className="text-muted-foreground shrink-0">
                      by {log.userLabel}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground shrink-0 tabular-nums">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

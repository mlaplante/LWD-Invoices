import Link from "next/link";

type ActivityItem = {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityLabel: string | null;
  entityId?: string | null;
};

type Props = { items: ActivityItem[]; linkItems?: boolean };

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const ACTION_CONFIG: Record<string, { label: string; dotColor: string }> = {
  CREATED:          { label: "created",          dotColor: "bg-primary" },
  UPDATED:          { label: "updated",           dotColor: "bg-blue-400" },
  SENT:             { label: "sent",              dotColor: "bg-violet-400" },
  PAYMENT_RECEIVED: { label: "payment received",  dotColor: "bg-emerald-500" },
  STATUS_CHANGED:   { label: "status changed",    dotColor: "bg-amber-400" },
  VIEWED:           { label: "viewed",            dotColor: "bg-sky-400" },
  DELETED:          { label: "deleted",           dotColor: "bg-red-400" },
};

function entityHref(entityType: string, entityId: string): string {
  const typeToPath: Record<string, string> = {
    Invoice: "invoices",
    Client: "clients",
    Project: "projects",
    Ticket: "tickets",
    Payment: "invoices",
    PartialPayment: "invoices",
    Expense: "expenses",
    CreditNote: "invoices",
    Contractor: "contractors",
    Dispute: "disputes",
  };
  const path = typeToPath[entityType] ?? entityType.toLowerCase() + "s";
  return `/${path}/${entityId}`;
}

export function ActivityFeed({ items, linkItems = false }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center px-5">
        <p className="text-xs text-muted-foreground">No recent activity.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {items.map((item) => {
        const cfg = ACTION_CONFIG[item.action] ?? { label: item.action.toLowerCase(), dotColor: "bg-gray-400" };
        const inner = (
          <>
            <div className="pt-1.5">
              <span className={`block w-2 h-2 rounded-full shrink-0 ${cfg.dotColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground leading-relaxed">
                <span className="font-medium">{item.entityType}</span>{" "}
                <span className="font-semibold">{item.entityLabel ?? "—"}</span>{" "}
                <span className="text-muted-foreground">{cfg.label}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {relativeTime(item.createdAt)}
              </p>
            </div>
          </>
        );

        if (linkItems && item.entityId) {
          return (
            <Link
              key={item.id}
              href={entityHref(item.entityType, item.entityId)}
              className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
            >
              {inner}
            </Link>
          );
        }

        return (
          <div key={item.id} className="flex items-start gap-3 px-5 py-3">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

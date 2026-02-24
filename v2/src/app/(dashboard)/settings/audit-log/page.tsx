import { api } from "@/trpc/server";
import { formatDistanceToNow } from "date-fns";

const actionColors: Record<string, string> = {
  CREATED: "bg-green-100 text-green-800",
  UPDATED: "bg-blue-100 text-blue-800",
  DELETED: "bg-red-100 text-red-800",
  STATUS_CHANGED: "bg-purple-100 text-purple-800",
  PAYMENT_RECEIVED: "bg-emerald-100 text-emerald-800",
  SENT: "bg-sky-100 text-sky-800",
  VIEWED: "bg-gray-100 text-gray-800",
};

export default async function AuditLogPage() {
  const logs = await api.auditLog.list({ limit: 50 });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Activity Log</h1>
      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-center gap-3 p-3 border rounded-md text-sm"
          >
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[log.action] ?? "bg-gray-100 text-gray-800"}`}
            >
              {log.action}
            </span>
            <span className="text-muted-foreground">{log.entityType}</span>
            <span className="font-medium">{log.entityLabel ?? log.entityId}</span>
            {log.userLabel && (
              <span className="text-muted-foreground">by {log.userLabel}</span>
            )}
            <span className="ml-auto text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="text-muted-foreground text-sm">No activity recorded yet</p>
        )}
      </div>
    </div>
  );
}

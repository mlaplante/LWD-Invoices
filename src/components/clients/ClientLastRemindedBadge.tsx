"use client";

import { trpc } from "@/trpc/client";
import { BellRing } from "lucide-react";

function ago(date: Date): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/**
 * "Last reminded" chip for the client detail header. Renders nothing until the
 * query resolves, or if the client has never been reminded.
 */
export function ClientLastRemindedBadge({ clientId }: { clientId: string }) {
  const { data } = trpc.clients.lastReminded.useQuery({ clientId });
  if (!data?.lastRemindedAt) return null;

  return (
    <span
      title={`Last reminder sent ${new Date(data.lastRemindedAt).toLocaleDateString()}`}
      className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground shrink-0"
    >
      <BellRing className="w-3 h-3" />
      Reminded {ago(data.lastRemindedAt)}
    </span>
  );
}

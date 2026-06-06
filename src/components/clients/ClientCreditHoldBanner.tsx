"use client";

import { trpc } from "@/trpc/client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Compact, warn-only banner shown on the invoice detail page when the invoice's
 * client is on credit hold or over their credit limit. Advisory only — it never
 * blocks sending or charging, it just makes the risk impossible to miss right
 * where you'd act on the invoice.
 */
export function ClientCreditHoldBanner({ clientId }: { clientId: string }) {
  const { data } = trpc.clients.creditStatus.useQuery({ clientId });
  if (!data?.shouldWarn) return null;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3.5 flex items-start gap-2.5">
      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      <div className="text-sm text-red-800 flex-1">
        {data.creditHold && (
          <span className="font-medium">
            This client is on credit hold{data.creditHoldAuto ? " (auto)" : ""}.
            {data.creditHoldReason ? ` ${data.creditHoldReason}` : ""}{" "}
          </span>
        )}
        {data.isOverLimit && (
          <span>
            Open balance {fmt(data.exposure)} exceeds their {fmt(data.creditLimit ?? 0)} credit
            limit by <strong>{fmt(data.overLimitBy)}</strong>.{" "}
          </span>
        )}
        <span className="text-red-700/80">Review before sending or charging. </span>
        <Link href={`/clients/${clientId}`} className="underline font-medium">
          Manage credit
        </Link>
      </div>
    </div>
  );
}

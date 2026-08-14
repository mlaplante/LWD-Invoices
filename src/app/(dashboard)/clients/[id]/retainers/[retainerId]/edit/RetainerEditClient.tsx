"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { RetainerForm } from "@/components/admin/retainers/RetainerForm";

export function RetainerEditClient({
  clientId,
  retainerId,
}: {
  clientId: string;
  retainerId: string;
}) {
  const { data, isLoading } = trpc.hoursRetainers.getDetail.useQuery({ id: retainerId });

  if (isLoading || !data) return <div>Loading…</div>;

  return (
    <div className="space-y-4 max-w-lg">
      <Link
        href={`/clients/${clientId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to client
      </Link>
      <h1 className="text-2xl font-semibold">Edit retainer</h1>
      <RetainerForm
        mode="edit"
        id={retainerId}
        initial={{
          name: data.name,
          includedHours: Number(data.includedHours),
          hourlyRate: data.hourlyRate ? Number(data.hourlyRate) : null,
          active: data.active,
          clientId,
        }}
      />
    </div>
  );
}

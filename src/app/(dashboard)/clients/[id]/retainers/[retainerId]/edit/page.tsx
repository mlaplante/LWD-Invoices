"use client";

import { use } from "react";
import { trpc } from "@/trpc/client";
import { RetainerForm } from "@/components/admin/retainers/RetainerForm";

export default function EditRetainerPage({
  params,
}: {
  params: Promise<{ id: string; retainerId: string }>;
}) {
  const { id: clientId, retainerId } = use(params);
  const { data, isLoading } = trpc.hoursRetainers.getDetail.useQuery({ id: retainerId });

  if (isLoading || !data) return <div>Loading…</div>;

  return (
    <div className="space-y-4 max-w-lg">
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

"use client";

import Link from "next/link";
import { use } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClosePeriodBanner } from "@/components/admin/retainers/ClosePeriodBanner";
import { PeriodHistory } from "@/components/admin/retainers/PeriodHistory";

export default function RetainerDetailPage({
  params,
}: {
  params: Promise<{ id: string; retainerId: string }>;
}) {
  const { id: clientId, retainerId } = use(params);
  const { data, isLoading } = trpc.hoursRetainers.getDetail.useQuery({ id: retainerId });

  if (isLoading || !data) return <div>Loading…</div>;

  const activePeriod = data.periods.find((p) => p.status === "ACTIVE");
  const closedPeriods = data.periods.filter((p) => p.status === "CLOSED");
  const now = new Date();
  const showRollover =
    activePeriod && new Date(activePeriod.periodEnd).getTime() < now.getTime();

  return (
    <div className="space-y-4 max-w-3xl">
      <Link
        href={`/clients/${clientId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to {data.client?.name ?? "client"}
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-sm text-muted-foreground">
            {data.resetInterval === "MONTHLY" ? "Monthly" : "Block"} ·{" "}
            {data.includedHours.toString()} hrs
          </p>
        </div>
        <Link href={`/clients/${clientId}/retainers/${retainerId}/edit`}>
          <Button variant="secondary">Edit</Button>
        </Link>
      </div>

      {showRollover && activePeriod && (
        <ClosePeriodBanner
          retainerId={retainerId}
          periodLabel={activePeriod.label}
          periodEnd={new Date(activePeriod.periodEnd)}
        />
      )}

      {activePeriod && (
        <Card className="p-4">
          <h2 className="font-medium mb-2">Active period: {activePeriod.label}</h2>
          <div className="text-sm">
            {activePeriod.includedHoursSnapshot.toString()} hrs allocated
          </div>
        </Card>
      )}

      {data.resetInterval === "MONTHLY" && (
        <PeriodHistory
          periods={closedPeriods.map((p) => ({
            id: p.id,
            label: p.label,
            periodStart: new Date(p.periodStart),
            periodEnd: new Date(p.periodEnd),
            includedHoursSnapshot: p.includedHoursSnapshot.toString(),
            status: p.status as "ACTIVE" | "CLOSED",
          }))}
        />
      )}

      <Card className="p-4">
        <h3 className="font-medium mb-2">Time entries</h3>
        {data.timeEntries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No entries yet.</div>
        ) : (
          <ul className="divide-y">
            {data.timeEntries.map((te) => (
              <li key={te.id} className="py-2 text-sm flex gap-4">
                <span>{new Date(te.date).toLocaleDateString()}</span>
                <span className="font-medium">
                  {(Number(te.minutes) / 60).toFixed(2)} hrs
                </span>
                <span className="text-muted-foreground">{te.note ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

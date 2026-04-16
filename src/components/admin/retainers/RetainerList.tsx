"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function RetainerList({ clientId }: { clientId: string }) {
  const { data, isLoading } = trpc.hoursRetainers.list.useQuery({ clientId });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading retainers…</div>;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Hours Retainers</h2>
        <Link href={`/clients/${clientId}/retainers/new`}>
          <Button size="sm">New hours retainer</Button>
        </Link>
      </div>

      {(!data || data.length === 0) && (
        <Card className="p-4 text-sm text-muted-foreground">
          No hours retainers yet.
        </Card>
      )}

      {data?.map((r) => (
        <Link
          key={r.id}
          href={`/clients/${clientId}/retainers/${r.id}`}
          className="block"
        >
          <Card className="p-4 hover:bg-accent transition-colors flex items-center justify-between">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-sm text-muted-foreground">
                {r.resetInterval === "MONTHLY" ? "Monthly" : "Block"} ·{" "}
                {r.includedHours.toString()} hrs
              </div>
            </div>
            {!r.active && <Badge variant="secondary">Inactive</Badge>}
          </Card>
        </Link>
      ))}
    </section>
  );
}

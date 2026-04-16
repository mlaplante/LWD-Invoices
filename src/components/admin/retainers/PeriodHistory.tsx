import { Card } from "@/components/ui/card";

export function PeriodHistory({
  periods,
}: {
  periods: Array<{
    id: string;
    label: string;
    periodStart: Date;
    periodEnd: Date;
    includedHoursSnapshot: string;
    status: "ACTIVE" | "CLOSED";
  }>;
}) {
  if (periods.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="font-medium mb-2">Period history</h3>
      <ul className="divide-y">
        {periods.map((p) => (
          <li key={p.id} className="py-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-xs text-muted-foreground">
                {p.periodStart.toLocaleDateString()} —{" "}
                {p.periodEnd.toLocaleDateString()}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {p.includedHoursSnapshot} hrs · {p.status.toLowerCase()}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

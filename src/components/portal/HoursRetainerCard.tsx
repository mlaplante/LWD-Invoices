import { Card } from "@/components/ui/card";
import type { PortalRetainer } from "@/server/services/portal-hours-retainers";

function Gauge({ used, total }: { used: number; total: number }) {
  const pct = total === 0 ? 0 : Math.min(100, (used / total) * 100);
  const over = used > total;
  return (
    <div className="w-full">
      <div className="h-2 bg-muted rounded overflow-hidden">
        <div
          className={`h-full ${over ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-sm mt-1">
        {used.toFixed(2)} / {total.toFixed(2)} hrs
        {over ? (
          <span className="text-amber-700 ml-2">
            {(used - total).toFixed(2)} hrs over
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function HoursRetainerCard({ r }: { r: PortalRetainer }) {
  const isMonthly = r.type === "MONTHLY";
  const activeLabel = isMonthly && r.activePeriod ? ` — ${r.activePeriod.label}` : "";

  const gaugeUsed = Number(
    isMonthly && r.activePeriod ? r.activePeriod.usedHours : r.usedHours,
  );
  const gaugeTotal = Number(
    isMonthly && r.activePeriod
      ? r.activePeriod.includedHoursSnapshot
      : r.includedHours,
  );

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">
          {r.name}
          <span className="text-muted-foreground font-normal">{activeLabel}</span>
        </h3>
        <Gauge used={gaugeUsed} total={gaugeTotal} />
      </div>

      {isMonthly && r.previousPeriods.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-1">Previous periods</h4>
          <ul className="space-y-1 text-sm">
            {r.previousPeriods.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.label}</span>
                <span className="text-muted-foreground">
                  {Number(p.usedHours).toFixed(2)} /{" "}
                  {Number(p.includedHoursSnapshot).toFixed(2)} hrs
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.workLog.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-1">
            {isMonthly ? "Current period work log" : "Work log"}
          </h4>
          <ul className="space-y-1 text-sm">
            {r.workLog.slice(0, 20).map((e, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <div className="flex justify-between">
                  <span>{new Date(e.date).toLocaleDateString()}</span>
                  <span className="font-mono">{Number(e.hours).toFixed(2)} hrs</span>
                </div>
                {e.note && (
                  <div className="text-xs text-muted-foreground">{e.note}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

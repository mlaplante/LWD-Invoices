"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function usd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY";

/**
 * Interactive what-if planner over the cash-flow forecast: model a late-paying
 * client, a contractor hire, and recurring-revenue churn, then compare the
 * scenario's projected position against the baseline.
 */
export function ScenarioPlanner() {
  const [lateEnabled, setLateEnabled] = useState(false);
  const [lateClientId, setLateClientId] = useState<string>("");
  const [lateDays, setLateDays] = useState(20);

  const [hireEnabled, setHireEnabled] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(85);
  const [hoursPerPeriod, setHoursPerPeriod] = useState(40);
  const [hireFrequency, setHireFrequency] = useState<Frequency>("MONTHLY");

  const [churnEnabled, setChurnEnabled] = useState(false);
  const [churnPercent, setChurnPercent] = useState(10);

  // Baseline query (no scenario) to populate the client picker + base numbers.
  const baseline = trpc.analytics.cashFlowForecast.useQuery(undefined);

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of baseline.data?.base.inflows ?? []) {
      if (e.source === "open_invoice" && e.clientId) {
        map.set(e.clientId, e.label.replace(" — open invoice", ""));
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [baseline.data]);

  const scenarioInput = useMemo(() => {
    const input: {
      scenarios?: { clientId: string; clientName: string; delayDays: number }[];
      contractorHire?: { hourlyRate: number; hoursPerPeriod: number; frequency: Frequency };
      churn?: { churnPercent: number };
    } = {};
    if (lateEnabled && lateClientId) {
      const name = clients.find((c) => c.id === lateClientId)?.name ?? "Client";
      input.scenarios = [{ clientId: lateClientId, clientName: name, delayDays: lateDays }];
    }
    if (hireEnabled) input.contractorHire = { hourlyRate, hoursPerPeriod, frequency: hireFrequency };
    if (churnEnabled) input.churn = { churnPercent };
    return input;
  }, [
    lateEnabled, lateClientId, lateDays, clients,
    hireEnabled, hourlyRate, hoursPerPeriod, hireFrequency,
    churnEnabled, churnPercent,
  ]);

  const hasScenario =
    Boolean(scenarioInput.scenarios?.length) ||
    Boolean(scenarioInput.contractorHire) ||
    Boolean(scenarioInput.churn);

  const forecast = trpc.analytics.cashFlowForecast.useQuery(hasScenario ? scenarioInput : undefined);
  const data = forecast.data ?? baseline.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenario planner</CardTitle>
        <CardDescription>
          Model what-ifs against your cash-flow forecast and compare the projected position to the
          baseline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Controls */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Late payment */}
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <label className="flex items-center justify-between text-sm font-medium">
              Client pays late
              <Switch checked={lateEnabled} onCheckedChange={setLateEnabled} />
            </label>
            {lateEnabled && (
              <div className="space-y-2">
                <Select value={lateClientId} onValueChange={setLateClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="block text-xs text-muted-foreground">
                  Days late
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={lateDays}
                    onChange={(e) => setLateDays(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Contractor hire */}
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <label className="flex items-center justify-between text-sm font-medium">
              Hire a contractor
              <Switch checked={hireEnabled} onCheckedChange={setHireEnabled} />
            </label>
            {hireEnabled && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-muted-foreground">
                  $/hour
                  <Input type="number" min={1} value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Hours
                  <Input type="number" min={1} value={hoursPerPeriod} onChange={(e) => setHoursPerPeriod(Number(e.target.value))} />
                </label>
                <label className="col-span-2 block text-xs text-muted-foreground">
                  Per
                  <Select value={hireFrequency} onValueChange={(v) => setHireFrequency(v as Frequency)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEEKLY">Week</SelectItem>
                      <SelectItem value="MONTHLY">Month</SelectItem>
                      <SelectItem value="YEARLY">Year</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
            )}
          </div>

          {/* Churn */}
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <label className="flex items-center justify-between text-sm font-medium">
              Recurring revenue churns
              <Switch checked={churnEnabled} onCheckedChange={setChurnEnabled} />
            </label>
            {churnEnabled && (
              <label className="block text-xs text-muted-foreground">
                Churn %
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={churnPercent}
                  onChange={(e) => setChurnPercent(Number(e.target.value))}
                />
              </label>
            )}
          </div>
        </div>

        {/* Results */}
        {baseline.isLoading ? (
          <p className="text-sm text-muted-foreground">Projecting…</p>
        ) : data ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {data.base.horizons.map((h) => {
              const scen = data.scenario?.horizons.find((s) => s.horizonDays === h.horizonDays);
              const delta = scen ? scen.projectedPosition - h.projectedPosition : 0;
              return (
                <div key={h.horizonDays} className="rounded-lg border border-border/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {h.horizonDays} days
                  </p>
                  <p className="text-2xl font-bold tabular-nums mt-1">{usd(h.projectedPosition)}</p>
                  <p className="text-xs text-muted-foreground">baseline position</p>
                  {scen && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-sm font-semibold tabular-nums">{usd(scen.projectedPosition)}</p>
                      <p className={delta < 0 ? "text-xs text-red-600" : "text-xs text-emerald-600"}>
                        {delta < 0 ? "" : "+"}{usd(delta)} vs baseline
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

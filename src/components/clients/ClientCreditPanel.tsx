"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AlertTriangle, ShieldCheck, ShieldAlert, Save } from "lucide-react";

/**
 * Credit limit / credit hold panel on the client detail page. Shows current AR
 * exposure vs. limit and the health score, lets an admin set the limit + the
 * auto-hold policy (the health-score trigger), and place/release a manual hold.
 * Holds are advisory — the panel surfaces a prominent banner but nothing here
 * hard-blocks invoicing.
 */
export function ClientCreditPanel({ clientId }: { clientId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.clients.creditStatus.useQuery({ clientId });

  const [limit, setLimit] = useState("");
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [threshold, setThreshold] = useState("50");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    setLimit(data.creditLimit !== null ? String(data.creditLimit) : "");
    setAutoEnabled(data.autoCreditHoldEnabled);
    setThreshold(data.autoCreditHoldThreshold !== null ? String(data.autoCreditHoldThreshold) : "50");
    setDirty(false);
  }, [data]);

  const savePolicy = trpc.clients.setCreditPolicy.useMutation({
    onSuccess: () => {
      utils.clients.creditStatus.invalidate({ clientId });
      toast.success("Credit policy saved");
      setDirty(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const setHold = trpc.clients.setCreditHold.useMutation({
    onSuccess: (_d, vars) => {
      utils.clients.creditStatus.invalidate({ clientId });
      toast.success(vars.hold ? "Credit hold placed" : "Credit hold released");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="h-5 w-32 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {data.creditHold ? (
            <ShieldAlert className="w-4 h-4 text-red-600" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          )}
          <h2 className="text-base font-semibold">Credit</h2>
        </div>
        {data.healthScore !== null && (
          <span className="text-xs text-muted-foreground">
            Health score <span className="font-semibold text-foreground">{data.healthScore}/100</span>
          </span>
        )}
      </div>

      {/* Warning banner */}
      {data.shouldWarn && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            {data.creditHold && (
              <p className="font-medium">
                This client is on credit hold{data.creditHoldAuto ? " (auto)" : ""}.
                {data.creditHoldReason ? ` ${data.creditHoldReason}` : ""}
              </p>
            )}
            {data.isOverLimit && (
              <p className={cn(data.creditHold && "mt-1")}>
                Open balance {fmt(data.exposure)} exceeds the {fmt(data.creditLimit ?? 0)} limit by{" "}
                <strong>{fmt(data.overLimitBy)}</strong>.
              </p>
            )}
            <p className="mt-1 text-xs text-red-700/80">
              Review before sending new invoices or charging a saved card.
            </p>
          </div>
        </div>
      )}

      {/* Exposure vs. limit */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Open balance</p>
          <p className="text-lg font-bold mt-0.5">{fmt(data.exposure)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Credit limit</p>
          <p className="text-lg font-bold mt-0.5">{data.creditLimit !== null ? fmt(data.creditLimit) : "—"}</p>
        </div>
      </div>

      {/* Policy editor */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Credit limit (open AR)</label>
          <Input
            type="number"
            min={0}
            placeholder="No limit"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setDirty(true);
            }}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Auto credit hold</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
              Automatically place a hold when this client&apos;s health score drops below the
              threshold. Released automatically when it recovers.
            </p>
          </div>
          <Switch
            checked={autoEnabled}
            onCheckedChange={(v) => {
              setAutoEnabled(v);
              setDirty(true);
            }}
          />
        </div>

        {autoEnabled && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Hold when health score is below
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => {
                setThreshold(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            disabled={!dirty || savePolicy.isPending}
            onClick={() =>
              savePolicy.mutate({
                clientId,
                creditLimit: limit.trim() === "" ? null : Number(limit),
                autoCreditHoldEnabled: autoEnabled,
                autoCreditHoldThreshold: autoEnabled ? Number(threshold) : null,
              })
            }
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save policy
          </Button>

          {data.creditHold ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={setHold.isPending}
              onClick={() => setHold.mutate({ clientId, hold: false })}
            >
              Release hold
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700"
              disabled={setHold.isPending}
              onClick={() => setHold.mutate({ clientId, hold: true, reason: "Manual credit hold." })}
            >
              Place hold
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

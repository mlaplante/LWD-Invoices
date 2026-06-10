"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Car, Pencil, ArrowRight } from "lucide-react";
import { toast } from "sonner";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY_FORM = {
  date: todayLocalISO(),
  miles: "",
  description: "",
  fromLocation: "",
  toLocation: "",
  roundTrip: false,
  billable: false,
  projectId: "none",
};

export function MileageTracker() {
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const utils = trpc.useUtils();
  const { data: page } = trpc.mileage.list.useQuery({});
  const entries = page?.items ?? [];
  const { data: summary } = trpc.mileage.summary.useQuery();
  // projects.list takes paginated input ({} uses the defaults) and returns { items, total }.
  const { data: projectsData } = trpc.projects.list.useQuery({}, { enabled: addOpen });
  const projects = projectsData?.items ?? [];

  const invalidate = () => {
    utils.mileage.list.invalidate();
    utils.mileage.summary.invalidate();
  };

  const create = trpc.mileage.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Trip logged");
      setAddOpen(false);
      setForm({ ...EMPTY_FORM, date: todayLocalISO() });
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.mileage.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Entry deleted");
      setDeleteId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteId(null);
    },
  });

  const updateRate = trpc.mileage.updateRate.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Mileage rate updated");
      setRateOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleCreate() {
    const miles = Number(form.miles);
    if (!Number.isFinite(miles) || miles <= 0) {
      toast.error("Enter the miles driven");
      return;
    }
    create.mutate({
      // Noon local avoids the date shifting a day in other time zones.
      date: new Date(`${form.date}T12:00:00`),
      miles,
      description: form.description.trim() || undefined,
      fromLocation: form.fromLocation.trim() || undefined,
      toLocation: form.toLocation.trim() || undefined,
      roundTrip: form.roundTrip,
      billable: form.billable,
      projectId: form.projectId !== "none" ? form.projectId : undefined,
    });
  }

  const summaryCards = [
    { label: "Miles this month", value: summary ? summary.monthMiles.toLocaleString() : "—" },
    { label: "Deduction this month", value: summary ? usd(summary.monthDeduction) : "—" },
    { label: "Miles YTD", value: summary ? summary.ytdMiles.toLocaleString() : "—" },
    { label: "Deduction YTD", value: summary ? usd(summary.ytdDeduction) : "—" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mileage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Log business trips and track your mileage deduction.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Log trip
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {c.label}
              </p>
              <p className="text-xl font-bold tabular-nums mt-1">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Current rate: <span className="tabular-nums font-medium text-foreground">
          ${summary ? summary.currentRate.toFixed(2) : "—"}/mile
        </span>{" "}
        <button
          type="button"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
          onClick={() => {
            setRateDraft(summary ? String(summary.currentRate) : "");
            setRateOpen(true);
          }}
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>{" "}
        — applied to new entries; past trips keep the rate they were logged at.
      </p>

      {/* Entries */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Car className="w-8 h-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">No trips logged yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Log your first business trip and the deduction math happens automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Trip</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium text-right">Miles</th>
                <th className="px-3 py-2 font-medium text-right">Rate</th>
                <th className="px-3 py-2 font-medium text-right">Deduction</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const miles = Number(e.miles) * (e.roundTrip ? 2 : 1);
                const rate = Number(e.ratePerMile);
                return (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {e.fromLocation || e.toLocation ? (
                          <span className="inline-flex items-center gap-1">
                            {e.fromLocation || "—"}
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            {e.toLocation || "—"}
                          </span>
                        ) : (
                          <span>{e.description || "Trip"}</span>
                        )}
                        {e.roundTrip && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            round trip
                          </span>
                        )}
                        {e.billable && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            billable
                          </span>
                        )}
                      </div>
                      {(e.fromLocation || e.toLocation) && e.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.project?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{miles.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      ${rate.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {usd(miles * rate)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(e.id)}
                        aria-label="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Log trip dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log a trip</DialogTitle>
            <DialogDescription>
              Deduction is calculated at the current rate
              {summary ? ` ($${summary.currentRate.toFixed(2)}/mile)` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mileage-date">Date</Label>
                <Input
                  id="mileage-date"
                  type="date"
                  className="mt-1"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="mileage-miles">Miles (one way)</Label>
                <Input
                  id="mileage-miles"
                  type="number"
                  min="0"
                  step="0.1"
                  className="mt-1"
                  placeholder="12.5"
                  value={form.miles}
                  onChange={(e) => setForm((f) => ({ ...f, miles: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mileage-from">From</Label>
                <Input
                  id="mileage-from"
                  className="mt-1"
                  placeholder="Office"
                  value={form.fromLocation}
                  onChange={(e) => setForm((f) => ({ ...f, fromLocation: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="mileage-to">To</Label>
                <Input
                  id="mileage-to"
                  className="mt-1"
                  placeholder="Client site"
                  value={form.toLocation}
                  onChange={(e) => setForm((f) => ({ ...f, toLocation: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="mileage-description">Purpose</Label>
              <Input
                id="mileage-description"
                className="mt-1"
                placeholder="Kickoff meeting"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <Label>Project</Label>
              <Select
                value={form.projectId}
                onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-5 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.roundTrip}
                  onChange={(e) => setForm((f) => ({ ...f, roundTrip: e.target.checked }))}
                />
                Round trip (×2)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.billable}
                  onChange={(e) => setForm((f) => ({ ...f, billable: e.target.checked }))}
                />
                Billable to client
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Log trip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit rate dialog */}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mileage rate</DialogTitle>
            <DialogDescription>
              Dollars per mile for new entries (e.g. the IRS standard business rate). Existing
              entries are not changed.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="mileage-rate">Rate ($/mile)</Label>
            <Input
              id="mileage-rate"
              type="number"
              min="0"
              step="0.005"
              className="mt-1"
              value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateOpen(false)} disabled={updateRate.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const rate = Number(rateDraft);
                if (!Number.isFinite(rate) || rate < 0) {
                  toast.error("Enter a valid rate");
                  return;
                }
                updateRate.mutate({ ratePerMile: rate });
              }}
              disabled={updateRate.isPending}
            >
              {updateRate.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete mileage entry?"
        description="This removes the trip and its deduction from your totals."
        onConfirm={() => deleteId && remove.mutate({ id: deleteId })}
        loading={remove.isPending}
        destructive
      />
    </div>
  );
}

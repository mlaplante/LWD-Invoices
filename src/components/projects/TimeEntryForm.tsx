"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Task = { id: string; name: string };

type Props = {
  projectId: string;
  tasks: Task[];
  clientId?: string;
  onSuccess?: () => void;
};

export function TimeEntryForm({ projectId, tasks, clientId, onSuccess }: Props) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"project" | "retainer">("project");
  const [retainerId, setRetainerId] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    minutes: "",
    startTime: "",
    endTime: "",
    taskId: "",
    note: "",
  });
  const [useTimeRange, setUseTimeRange] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only query retainers when clientId is known and mode is retainer
  const { data: retainers = [], isLoading: retainersLoading } =
    trpc.hoursRetainers.list.useQuery(
      { clientId: clientId ?? "" },
      { enabled: !!clientId && mode === "retainer" },
    );
  const activeRetainers = retainers.filter((r) => r.active);

  const mutation = trpc.timeEntries.create.useMutation({
    onError: (err) => setError(err.message),
  });

  function computeMinutesFromRange(start: string, end: string): number | null {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? diff : null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let minutes: number;
    if (useTimeRange) {
      const computed = computeMinutesFromRange(form.startTime, form.endTime);
      if (!computed) {
        setError("Invalid time range — end must be after start.");
        return;
      }
      minutes = computed;
    } else {
      minutes = parseFloat(form.minutes);
      if (isNaN(minutes) || minutes <= 0) {
        setError("Enter a valid number of minutes.");
        return;
      }
    }

    if (mode === "retainer") {
      if (!retainerId) {
        setError("Please select a retainer.");
        return;
      }
      const selectedRetainer = activeRetainers.find((r) => r.id === retainerId);
      const retainerName = selectedRetainer?.name ?? "retainer";
      const hoursLabel = (minutes / 60).toFixed(1) + "h";
      mutation.mutate(
        {
          retainerId,
          projectId,
          date: new Date(form.date),
          minutes,
          startTime: useTimeRange ? form.startTime : undefined,
          endTime: useTimeRange ? form.endTime : undefined,
          taskId: form.taskId || undefined,
          note: form.note || undefined,
        },
        {
          onSuccess: () => {
            utils.timeEntries.list.invalidate({ projectId });
            if (clientId) utils.hoursRetainers.list.invalidate({ clientId });
            setForm({
              date: new Date().toISOString().slice(0, 10),
              minutes: "",
              startTime: "",
              endTime: "",
              taskId: form.taskId,
              note: "",
            });
            toast.success(`Logged ${hoursLabel} to ${retainerName}`);
            onSuccess?.();
          },
        },
      );
    } else {
      mutation.mutate(
        {
          projectId,
          date: new Date(form.date),
          minutes,
          startTime: useTimeRange ? form.startTime : undefined,
          endTime: useTimeRange ? form.endTime : undefined,
          taskId: form.taskId || undefined,
          note: form.note || undefined,
        },
        {
          onSuccess: () => {
            utils.timeEntries.list.invalidate({ projectId });
            setForm({
              date: new Date().toISOString().slice(0, 10),
              minutes: "",
              startTime: "",
              endTime: "",
              taskId: form.taskId,
              note: "",
            });
            onSuccess?.();
          },
        },
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {clientId && (
        <div>
          <label className="text-sm font-medium">Log against</label>
          <div className="mt-1 flex gap-1 rounded-lg border border-border p-1 w-fit">
            <button
              type="button"
              onClick={() => setMode("project")}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                mode === "project"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Project
            </button>
            <button
              type="button"
              onClick={() => setMode("retainer")}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                mode === "retainer"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Retainer
            </button>
          </div>
        </div>
      )}

      {mode === "retainer" && clientId && (
        <div>
          <label className="text-sm font-medium">Retainer</label>
          <Select
            value={retainerId || "none"}
            onValueChange={(v) => setRetainerId(v === "none" ? "" : v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a retainer" />
            </SelectTrigger>
            <SelectContent>
              {retainersLoading ? (
                <SelectItem value="none" disabled>
                  Loading retainers…
                </SelectItem>
              ) : activeRetainers.length === 0 ? (
                <SelectItem value="none" disabled>
                  No active retainers
                </SelectItem>
              ) : (
                activeRetainers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Date</label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            required
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Task (optional)</label>
          <Select
            value={form.taskId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, taskId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="No task" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No task</SelectItem>
              {tasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-2">
          <label className="text-sm font-medium">Time</label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={useTimeRange}
              onChange={(e) => setUseTimeRange(e.target.checked)}
            />
            Use start/end times
          </label>
        </div>

        {useTimeRange ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Start</label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End</label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                required
                className="mt-1"
              />
            </div>
          </div>
        ) : (
          <Input
            type="number"
            min="1"
            step="1"
            value={form.minutes}
            onChange={(e) => setForm((p) => ({ ...p, minutes: e.target.value }))}
            placeholder="Minutes"
            required
          />
        )}
      </div>

      <div>
        <label className="text-sm font-medium">Note (optional)</label>
        <Textarea
          value={form.note}
          onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
          placeholder="What did you work on?"
          rows={2}
          className="mt-1"
        />
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Logging…" : "Log Time"}
      </Button>
    </form>
  );
}

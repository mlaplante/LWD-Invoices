"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Org = {
  name: string;
  invoicePrefix: string;
  invoiceNextNumber: number;
  taskTimeInterval: number;
};

export function OrgSettingsForm({ org }: { org: Org }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: org.name,
    invoicePrefix: org.invoicePrefix,
    invoiceNextNumber: org.invoiceNextNumber,
    taskTimeInterval: org.taskTimeInterval,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = trpc.organization.update.useMutation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    updateMutation.mutate(
      {
        name: form.name,
        invoicePrefix: form.invoicePrefix,
        invoiceNextNumber: form.invoiceNextNumber,
        taskTimeInterval: form.taskTimeInterval,
      },
      {
        onSuccess: () => {
          setSaved(true);
          startTransition(() => router.refresh());
        },
        onError: (err) => setError(err.message),
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Saved successfully.
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Organization Name</label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Invoice Prefix</label>
          <Input
            value={form.invoicePrefix}
            onChange={(e) => setForm((p) => ({ ...p, invoicePrefix: e.target.value }))}
            placeholder="INV"
            maxLength={10}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Next Invoice Number</label>
          <Input
            type="number"
            min={1}
            value={form.invoiceNextNumber}
            onChange={(e) =>
              setForm((p) => ({ ...p, invoiceNextNumber: parseInt(e.target.value) || 1 }))
            }
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Task Time Interval (minutes)</label>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={form.taskTimeInterval}
          onChange={(e) =>
            setForm((p) => ({ ...p, taskTimeInterval: parseFloat(e.target.value) || 0 }))
          }
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Round time entries to this interval. Set to 0 to disable.
        </p>
      </div>

      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}

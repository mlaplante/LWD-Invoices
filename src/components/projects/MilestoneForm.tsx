"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  projectId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function MilestoneForm({ projectId, onSuccess, onCancel }: Props) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: "#3b82f6",
    targetDate: "",
    isViewable: false,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.milestones.create.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id: projectId });
      onSuccess?.();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      projectId,
      name: form.name,
      description: form.description || undefined,
      color: form.color,
      targetDate: form.targetDate ? new Date(form.targetDate) : undefined,
      isViewable: form.isViewable,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Name</label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Milestone name"
          required
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Optional description"
          rows={2}
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Color</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="w-10 h-10 rounded cursor-pointer"
            />
            <Input
              value={form.color}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Target Date</label>
          <Input
            type="date"
            value={form.targetDate}
            onChange={(e) => setForm((p) => ({ ...p, targetDate: e.target.value }))}
            className="mt-1"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isViewable}
          onChange={(e) => setForm((p) => ({ ...p, isViewable: e.target.checked }))}
        />
        Visible to client
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create Milestone"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

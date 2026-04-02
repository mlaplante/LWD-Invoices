"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import type { ProjectStatus } from "@/generated/prisma";

type Client = { id: string; name: string };
type Currency = { id: string; code: string; symbol: string };
type Template = { id: string; name: string };
type Project = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  dueDate: Date | null;
  rate: { toNumber(): number };
  projectedHours: number;
  isFlatRate: boolean;
  isViewable: boolean;
  isTimesheetViewable: boolean;
  clientId: string;
  currencyId: string;
};

type Props = {
  mode: "create" | "edit";
  project?: Project;
  clients: Client[];
  currencies: Currency[];
  templates: Template[];
};

export function ProjectForm({ mode, project, clients, currencies, templates }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [form, setForm] = useState({
    name: project?.name ?? "",
    description: project?.description ?? "",
    clientId: project?.clientId ?? (clients[0]?.id ?? ""),
    currencyId: project?.currencyId ?? (currencies[0]?.id ?? ""),
    status: (project?.status ?? "ACTIVE") as ProjectStatus,
    dueDate: project?.dueDate ? new Date(project.dueDate).toISOString().slice(0, 10) : "",
    rate: project?.rate.toNumber() ?? 0,
    projectedHours: project?.projectedHours ?? 0,
    isFlatRate: project?.isFlatRate ?? false,
    isViewable: project?.isViewable ?? false,
    isTimesheetViewable: project?.isTimesheetViewable ?? false,
    templateId: "",
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.projects.create.useMutation();
  const updateMutation = trpc.projects.update.useMutation();

  function handleChange(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const data = {
      name: form.name,
      description: form.description || undefined,
      clientId: form.clientId,
      currencyId: form.currencyId,
      status: form.status,
      dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
      rate: form.rate,
      projectedHours: form.projectedHours,
      isFlatRate: form.isFlatRate,
      isViewable: form.isViewable,
      isTimesheetViewable: form.isTimesheetViewable,
    };

    if (mode === "create") {
      createMutation.mutate(
        { ...data, templateId: form.templateId || undefined },
        {
          onSuccess: (project) => {
            startTransition(() => router.push(`/projects/${project.id}`));
          },
          onError: (err) => setError(err.message),
        }
      );
    } else if (project) {
      updateMutation.mutate(
        { id: project.id, ...data },
        {
          onSuccess: () => {
            startTransition(() => router.push(`/projects/${project.id}`));
          },
          onError: (err) => setError(err.message),
        }
      );
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Project Name</label>
          <Input
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Project name"
            required
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Description</label>
          <Textarea
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="Optional description"
            className="mt-1"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Client</label>
            <Select value={form.clientId} onValueChange={(v) => handleChange("clientId", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Currency</label>
            <Select value={form.currencyId} onValueChange={(v) => handleChange("currencyId", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} ({c.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Hourly Rate</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.rate}
              onChange={(e) => handleChange("rate", parseFloat(e.target.value) || 0)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Projected Hours</label>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={form.projectedHours}
              onChange={(e) => handleChange("projectedHours", parseFloat(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Due Date</label>
          <Input
            type="date"
            value={form.dueDate}
            onChange={(e) => handleChange("dueDate", e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isFlatRate}
              onChange={(e) => handleChange("isFlatRate", e.target.checked)}
            />
            Flat rate
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isViewable}
              onChange={(e) => handleChange("isViewable", e.target.checked)}
            />
            Visible to client
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isTimesheetViewable}
              onChange={(e) => handleChange("isTimesheetViewable", e.target.checked)}
            />
            Timesheets visible to client
          </label>
        </div>

        {mode === "create" && templates.length > 0 && (
          <div>
            <label className="text-sm font-medium">Apply Template (optional)</label>
            <Select
              value={form.templateId || "none"}
              onValueChange={(v) => handleChange("templateId", v === "none" ? "" : v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : mode === "create" ? "Create Project" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

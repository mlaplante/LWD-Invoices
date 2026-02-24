"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TaskStatus = {
  id: string;
  title: string;
  backgroundColor: string;
  fontColor: string;
  sortOrder: number;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  tasks: { id: string; name: string; sortOrder: number }[];
};

type Props = {
  taskStatuses: TaskStatus[];
  templates: Template[];
};

const ROUNDING_OPTIONS = [
  { value: "0", label: "None" },
  { value: "6", label: "6 min" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
];

export function ProjectSettingsForm({ taskStatuses: initial, templates: initialTemplates }: Props) {
  const [activeTab, setActiveTab] = useState<"statuses" | "rounding" | "templates">("statuses");

  // Task Statuses
  const utils = trpc.useUtils();
  const { data: statuses = initial } = trpc.taskStatuses.list.useQuery();
  const [newStatus, setNewStatus] = useState({
    title: "",
    backgroundColor: "#e5e7eb",
    fontColor: "#111827",
  });

  const createStatusMutation = trpc.taskStatuses.create.useMutation({
    onSuccess: () => {
      utils.taskStatuses.list.invalidate();
      setNewStatus({ title: "", backgroundColor: "#e5e7eb", fontColor: "#111827" });
    },
  });
  const deleteStatusMutation = trpc.taskStatuses.delete.useMutation({
    onSuccess: () => utils.taskStatuses.list.invalidate(),
  });

  // Time rounding — read from org settings
  // We'll use a simple update via a separate mechanism
  // For now track locally
  const [roundingInterval, setRoundingInterval] = useState("0");

  // Templates
  const { data: templates = initialTemplates } = trpc.projectTemplates.list.useQuery();
  const [newTemplateName, setNewTemplateName] = useState("");
  const createTemplateMutation = trpc.projectTemplates.create.useMutation({
    onSuccess: () => {
      utils.projectTemplates.list.invalidate();
      setNewTemplateName("");
    },
  });
  const deleteTemplateMutation = trpc.projectTemplates.delete.useMutation({
    onSuccess: () => utils.projectTemplates.list.invalidate(),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Tab bar */}
      <div className="border-b flex gap-6">
        {(["statuses", "rounding", "templates"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "statuses" ? "Task Statuses" : tab === "rounding" ? "Time Rounding" : "Templates"}
          </button>
        ))}
      </div>

      {/* Task Statuses */}
      {activeTab === "statuses" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create custom status labels for tasks with colored badges.
          </p>

          {statuses.length > 0 && (
            <div className="space-y-2">
              {statuses.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
                      style={{ backgroundColor: s.backgroundColor, color: s.fontColor }}
                    >
                      {s.title}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete status "${s.title}"?`)) {
                        deleteStatusMutation.mutate({ id: s.id });
                      }
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-medium">New Status</h3>
            <div>
              <label className="text-xs text-muted-foreground">Title</label>
              <Input
                value={newStatus.title}
                onChange={(e) => setNewStatus((p) => ({ ...p, title: e.target.value }))}
                placeholder="In Progress"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Background</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={newStatus.backgroundColor}
                    onChange={(e) =>
                      setNewStatus((p) => ({ ...p, backgroundColor: e.target.value }))
                    }
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                  <Input
                    value={newStatus.backgroundColor}
                    onChange={(e) =>
                      setNewStatus((p) => ({ ...p, backgroundColor: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Font color</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={newStatus.fontColor}
                    onChange={(e) => setNewStatus((p) => ({ ...p, fontColor: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                  <Input
                    value={newStatus.fontColor}
                    onChange={(e) => setNewStatus((p) => ({ ...p, fontColor: e.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                disabled={!newStatus.title || createStatusMutation.isPending}
                onClick={() => createStatusMutation.mutate(newStatus)}
              >
                Add Status
              </Button>
              {newStatus.title && (
                <span
                  className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: newStatus.backgroundColor,
                    color: newStatus.fontColor,
                  }}
                >
                  {newStatus.title}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Time Rounding */}
      {activeTab === "rounding" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Round logged time up to the nearest interval. Affects all time entries and stopped
            timers.
          </p>
          <div className="max-w-xs">
            <label className="text-sm font-medium">Rounding Interval</label>
            <Select value={roundingInterval} onValueChange={setRoundingInterval}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUNDING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Setting takes effect immediately for new entries. Existing entries are not changed.
            </p>
          </div>
          <Button size="sm" disabled>
            Save (coming soon)
          </Button>
        </div>
      )}

      {/* Templates */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Project templates let you pre-populate tasks when creating a new project.
          </p>

          {templates.length > 0 && (
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.tasks.length} task{t.tasks.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Delete template "${t.name}"?`)) {
                          deleteTemplateMutation.mutate({ id: t.id });
                        }
                      }}
                      className="text-xs text-destructive hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-medium">New Template</h3>
            <Input
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Template name"
            />
            <Button
              size="sm"
              disabled={!newTemplateName || createTemplateMutation.isPending}
              onClick={() =>
                createTemplateMutation.mutate({ name: newTemplateName, tasks: [] })
              }
            >
              Create Template
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

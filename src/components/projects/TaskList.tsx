"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimerWidget } from "./TimerWidget";

type TaskStatus = {
  id: string;
  title: string;
  backgroundColor: string;
  fontColor: string;
};

type Timer = {
  id: string;
  isPaused: boolean;
  currentSeconds: number;
  lastModifiedAt: Date;
};

type Task = {
  id: string;
  name: string;
  sortOrder: number;
  isCompleted: boolean;
  projectedHours: number;
  parentId: string | null;
  milestoneId: string | null;
  taskStatus: TaskStatus | null;
  timer: Timer | null;
  assignedUserId: string | null;
  _count?: { timeEntries: number; children: number };
};

type Milestone = {
  id: string;
  name: string;
  color: string;
};

type Project = {
  id: string;
  tasks: Task[];
  milestones: Milestone[];
};

type Props = {
  project: Project;
};

export function TaskList({ project }: Props) {
  const utils = trpc.useUtils();
  const [newTaskName, setNewTaskName] = useState("");
  const [addingSubtask, setAddingSubtask] = useState<string | null>(null);
  const [subTaskName, setSubTaskName] = useState("");

  const { data: tasks = [] } = trpc.tasks.list.useQuery({ projectId: project.id });

  const createMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ projectId: project.id });
      setNewTaskName("");
    },
  });

  const completeMutation = trpc.tasks.complete.useMutation({
    onSuccess: () => utils.tasks.list.invalidate({ projectId: project.id }),
  });

  const deleteMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => utils.tasks.list.invalidate({ projectId: project.id }),
  });

  const createSubtaskMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ projectId: project.id });
      setAddingSubtask(null);
      setSubTaskName("");
    },
  });

  // Build tree client-side: flat list → roots with children
  const roots = tasks.filter((t) => !t.parentId);
  const childrenOf = (parentId: string) => tasks.filter((t) => t.parentId === parentId);

  // Group roots by milestone
  const hasMilestones = project.milestones.length > 0;

  const grouped: { milestone: Milestone | null; tasks: Task[] }[] = [];
  if (hasMilestones) {
    for (const milestone of project.milestones) {
      const milestoneTasks = roots.filter((t) => t.milestoneId === milestone.id);
      if (milestoneTasks.length > 0) {
        grouped.push({ milestone, tasks: milestoneTasks });
      }
    }
    const ungrouped = roots.filter((t) => !t.milestoneId);
    if (ungrouped.length > 0) {
      grouped.push({ milestone: null, tasks: ungrouped });
    }
  } else {
    grouped.push({ milestone: null, tasks: roots });
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    createMutation.mutate({
      projectId: project.id,
      name: newTaskName.trim(),
      sortOrder: roots.length,
    });
  }

  function handleAddSubtask(e: React.FormEvent, parentId: string) {
    e.preventDefault();
    if (!subTaskName.trim()) return;
    createSubtaskMutation.mutate({
      projectId: project.id,
      name: subTaskName.trim(),
      parentId,
      sortOrder: childrenOf(parentId).length,
    });
  }

  function TaskRow({ task, indent = 0 }: { task: Task; indent?: number }) {
    const children = childrenOf(task.id);
    return (
      <>
        <tr className={`hover:bg-muted/20 transition-colors ${task.isCompleted ? "opacity-60" : ""}`}>
          <td className="px-4 py-2">
            <div className="flex items-center gap-2" style={{ paddingLeft: indent * 20 }}>
              <input
                type="checkbox"
                checked={task.isCompleted}
                onChange={(e) =>
                  completeMutation.mutate({ id: task.id, isCompleted: e.target.checked })
                }
                className="rounded"
              />
              <span className={`text-sm ${task.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                {task.name}
              </span>
              {task.taskStatus && (
                <span
                  className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: task.taskStatus.backgroundColor,
                    color: task.taskStatus.fontColor,
                  }}
                >
                  {task.taskStatus.title}
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-2 text-sm text-muted-foreground text-right">
            {task.projectedHours > 0 ? `${task.projectedHours}h` : "—"}
          </td>
          <td className="px-4 py-2">
            <TimerWidget taskId={task.id} />
          </td>
          <td className="px-4 py-2 text-right">
            <div className="flex items-center justify-end gap-2">
              {indent === 0 && (
                <button
                  onClick={() => setAddingSubtask(addingSubtask === task.id ? null : task.id)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  + sub
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm("Delete this task?")) {
                    deleteMutation.mutate({ id: task.id });
                  }
                }}
                className="text-xs text-destructive hover:underline"
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
        {addingSubtask === task.id && (
          <tr>
            <td colSpan={4} className="px-4 py-2">
              <form
                onSubmit={(e) => handleAddSubtask(e, task.id)}
                className="flex gap-2 pl-8"
              >
                <Input
                  value={subTaskName}
                  onChange={(e) => setSubTaskName(e.target.value)}
                  placeholder="Subtask name"
                  className="h-8 text-sm"
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={createSubtaskMutation.isPending}>
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingSubtask(null)}
                >
                  Cancel
                </Button>
              </form>
            </td>
          </tr>
        )}
        {children.map((child) => (
          <TaskRow key={child.id} task={child} indent={indent + 1} />
        ))}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">No tasks yet. Add one below.</p>
      )}

      {tasks.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Task</th>
                <th className="px-4 py-2 text-right font-medium">Est.</th>
                <th className="px-4 py-2 text-left font-medium">Timer</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {grouped.map(({ milestone, tasks: groupTasks }) => (
                <>
                  {milestone && (
                    <tr key={`ms-${milestone.id}`} className="bg-muted/30">
                      <td colSpan={4} className="px-4 py-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: milestone.color }}
                          />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {milestone.name}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {groupTasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add task form */}
      <form onSubmit={handleAddTask} className="flex gap-2">
        <Input
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          placeholder="Add a task…"
          className="max-w-sm"
        />
        <Button type="submit" disabled={createMutation.isPending || !newTaskName.trim()}>
          Add Task
        </Button>
      </form>
    </div>
  );
}

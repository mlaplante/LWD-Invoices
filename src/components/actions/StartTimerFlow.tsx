"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ActionPrimitiveProps } from "./QuickExpenseSheet";

export function StartTimerFlow({ open, onOpenChange, onCompleted }: ActionPrimitiveProps) {
  const [projectId, setProjectId] = useState<string>("");
  // projects.list requires paginated input; {} satisfies all optional/defaulted fields.
  // It returns { items, total }, not a bare array.
  const projects = trpc.projects.list.useQuery({}, { enabled: open });
  // tasks.list returns a bare array from projectTask.findMany
  const tasks = trpc.tasks.list.useQuery({ projectId }, { enabled: open && !!projectId });
  const utils = trpc.useUtils();

  const start = trpc.timers.start.useMutation({
    onSuccess: () => {
      toast.success("Timer started");
      void utils.timers.getUserTimers.invalidate();
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Start timer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="st-project">Project</Label>
            <select id="st-project" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project…</option>
              {projects.data?.items.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {projectId && (
            <div className="space-y-1.5">
              <Label>Task</Label>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {tasks.data?.map((t: { id: string; name: string }) => (
                  <Button key={t.id} variant="outline" className="w-full justify-start" disabled={start.isPending} onClick={() => start.mutate({ taskId: t.id })}>
                    {t.name}
                  </Button>
                ))}
                {tasks.data?.length === 0 && <p className="text-sm text-muted-foreground">No tasks in this project.</p>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

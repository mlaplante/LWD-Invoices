"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { MilestoneForm } from "./MilestoneForm";
import { toast } from "sonner";
import { Check, RotateCcw, Plus, FileText } from "lucide-react";
import Link from "next/link";

type Props = { projectId: string };

export function MilestoneList({ projectId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();

  const { data: milestones, isLoading } = trpc.milestones.list.useQuery({ projectId });

  const completeMutation = trpc.milestones.complete.useMutation({
    onSuccess: () => {
      utils.milestones.list.invalidate({ projectId });
      toast.success("Milestone completed");
    },
    onError: (err) => toast.error(err.message),
  });

  const reopenMutation = trpc.milestones.reopen.useMutation({
    onSuccess: () => {
      utils.milestones.list.invalidate({ projectId });
      toast.success("Milestone reopened");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading milestones…</div>;
  }

  return (
    <div className="space-y-4">
      {milestones && milestones.length > 0 ? (
        <div className="space-y-2">
          {milestones.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: m.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-medium text-sm ${m.completedAt ? "line-through text-muted-foreground" : ""}`}>
                    {m.name}
                  </p>
                  {m.amount && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ${Number(m.amount).toFixed(2)}
                    </span>
                  )}
                </div>
                {m.completedAt && (
                  <p className="text-xs text-muted-foreground">
                    Completed {new Date(m.completedAt).toLocaleDateString()}
                    {m.invoiceId && (
                      <>
                        {" · "}
                        <Link
                          href={`/invoices/${m.invoiceId}`}
                          className="text-primary hover:underline"
                        >
                          <FileText className="w-3 h-3 inline -mt-0.5" /> View Invoice
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {!m.completedAt && m.targetDate && (
                  <p className="text-xs text-muted-foreground">
                    Due {new Date(m.targetDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {!m.completedAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => completeMutation.mutate({ id: m.id })}
                    disabled={completeMutation.isPending}
                  >
                    <Check className="w-3 h-3" />
                    Complete
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => reopenMutation.mutate({ id: m.id })}
                    disabled={reopenMutation.isPending}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No milestones yet.
          </div>
        )
      )}

      {showForm ? (
        <MilestoneForm
          projectId={projectId}
          onSuccess={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Milestone
        </Button>
      )}
    </div>
  );
}

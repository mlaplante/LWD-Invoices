"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

function computeSeconds(timer: {
  isPaused: boolean;
  currentSeconds: number;
  lastModifiedAt: Date;
}): number {
  if (timer.isPaused) return timer.currentSeconds;
  const elapsed = Math.floor((Date.now() - new Date(timer.lastModifiedAt).getTime()) / 1000);
  return timer.currentSeconds + elapsed;
}

type Props = {
  taskId: string;
};

export function TimerWidget({ taskId }: Props) {
  const utils = trpc.useUtils();
  const { data: timer, isLoading } = trpc.timers.getActive.useQuery({ taskId });

  // Initialize displaySeconds from the timer directly — no sync setState in effect
  const [displaySeconds, setDisplaySeconds] = useState(() =>
    timer ? computeSeconds(timer) : 0
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMutation = trpc.timers.start.useMutation({
    onSuccess: () => utils.timers.getActive.invalidate({ taskId }),
  });
  const pauseMutation = trpc.timers.pause.useMutation({
    onSuccess: () => utils.timers.getActive.invalidate({ taskId }),
  });
  const resumeMutation = trpc.timers.resume.useMutation({
    onSuccess: () => utils.timers.getActive.invalidate({ taskId }),
  });
  const stopMutation = trpc.timers.stop.useMutation({
    onSuccess: () => {
      utils.timers.getActive.invalidate({ taskId });
      utils.timeEntries.list.invalidate();
    },
  });

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!timer) {
      intervalRef.current = null;
      return;
    }

    // Tick immediately on timer change, then every second if running
    const tick = () => setDisplaySeconds(computeSeconds(timer));
    tick();

    if (!timer.isPaused) {
      intervalRef.current = setInterval(tick, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timer]);

  if (isLoading) return <span className="text-xs text-muted-foreground">…</span>;

  const isMutating =
    startMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    stopMutation.isPending;

  if (!timer) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => startMutation.mutate({ taskId })}
        disabled={isMutating}
        className="h-7 px-2 text-xs"
      >
        ▶ Start
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-xs tabular-nums w-16">{formatSeconds(displaySeconds)}</span>
      {timer.isPaused ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => resumeMutation.mutate({ taskId })}
          disabled={isMutating}
          className="h-7 px-2 text-xs"
        >
          ▶
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => pauseMutation.mutate({ taskId })}
          disabled={isMutating}
          className="h-7 px-2 text-xs"
        >
          ⏸
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => stopMutation.mutate({ taskId })}
        disabled={isMutating}
        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
      >
        ⏹
      </Button>
    </div>
  );
}

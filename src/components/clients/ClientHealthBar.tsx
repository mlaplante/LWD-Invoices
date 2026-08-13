import { cn } from "@/lib/utils";

export type HealthBand = "healthy" | "stable" | "at_risk" | "critical";

const BAND_FILL: Record<HealthBand, string> = {
  healthy: "bg-success",
  stable: "bg-success",
  at_risk: "bg-warning",
  critical: "bg-danger",
};

const BAND_TEXT: Record<HealthBand, string> = {
  healthy: "text-success-foreground",
  stable: "text-success-foreground",
  at_risk: "text-warning-foreground",
  critical: "text-danger-foreground",
};

const BEHAVIOR_LABEL: Record<HealthBand, string> = {
  healthy: "reliable payer",
  stable: "reliable payer",
  at_risk: "watch",
  critical: "churn risk",
};

/**
 * 44×6px track with the score beside it in mono. Deliberately not a
 * percentage ring or a gauge — at list density a bar reads faster and
 * lines up cleanly down the column.
 */
export function ClientHealthBar({
  score,
  band,
  lowData,
}: {
  score: number;
  band: HealthBand;
  lowData?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-11 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
        <span
          className={cn("block h-full rounded-full", BAND_FILL[band])}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </span>
      <span className={cn("font-mono text-[11px] font-medium", BAND_TEXT[band])}>
        {score}
      </span>
      {lowData && (
        <span className="font-mono text-[9px] text-muted-foreground">
          low data
        </span>
      )}
    </span>
  );
}

/** Pill form of the same band — "reliable payer" / "watch" / "churn risk". */
export function ClientBehaviorPill({
  band,
  isNew,
}: {
  band: HealthBand;
  isNew?: boolean;
}) {
  if (isNew) {
    return (
      <span className="inline-flex items-center rounded-full bg-black/5 px-[11px] py-[3px] text-[10px] font-medium tracking-[0.5px] text-[#777] dark:bg-white/8 dark:text-muted-foreground">
        new
      </span>
    );
  }

  const tint =
    band === "critical"
      ? "bg-danger/10 text-danger-foreground"
      : band === "at_risk"
        ? "bg-warning/12 text-warning-foreground"
        : "bg-success/10 text-success-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-[11px] py-[3px] text-[10px] font-medium tracking-[0.5px]",
        tint,
      )}
    >
      {BEHAVIOR_LABEL[band]}
    </span>
  );
}

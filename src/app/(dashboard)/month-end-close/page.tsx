import { MonthEndClose } from "@/components/close/MonthEndClose";

export const metadata = { title: "Month-end close" };

export default function MonthEndClosePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Month-end close</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          The close agent reconciles the month, flags anomalies, and drafts adjusting entries —
          then presents a one-click close for your approval. Closing freezes a snapshot and locks
          the period; you can reopen it any time.
        </p>
      </div>
      <MonthEndClose />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card h-20" />
        <div className="rounded-2xl border border-border/50 bg-card h-20" />
      </div>
      <div className="rounded-2xl border border-border/50 bg-card h-64" />
    </div>
  );
}

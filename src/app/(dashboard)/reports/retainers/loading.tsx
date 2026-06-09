export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-64 bg-muted rounded" />
      <div className="rounded-2xl border border-border/50 bg-card h-48" />
      <div className="rounded-2xl border border-border/50 bg-card h-48" />
    </div>
  );
}

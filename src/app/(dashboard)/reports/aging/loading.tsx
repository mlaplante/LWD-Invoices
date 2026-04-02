export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/50 bg-card h-20" />
        ))}
      </div>
      <div className="rounded-2xl border border-border/50 bg-card h-64" />
    </div>
  );
}

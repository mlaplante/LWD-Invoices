export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[10px] border border-border bg-card p-4 h-20" />
        ))}
      </div>
      <div className="rounded-[10px] border border-border bg-card h-64" />
    </div>
  );
}

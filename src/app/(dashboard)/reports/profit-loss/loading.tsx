export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="rounded-[10px] border border-border bg-card h-32" />
      <div className="rounded-[10px] border border-border bg-card h-64" />
    </div>
  );
}

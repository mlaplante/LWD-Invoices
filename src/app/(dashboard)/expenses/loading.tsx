export default function ExpensesLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-36 rounded-lg bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </div>
        <div className="h-9 w-32 rounded-xl bg-muted" />
      </div>
      <div className="h-64 w-full rounded-2xl bg-muted" />
    </div>
  );
}

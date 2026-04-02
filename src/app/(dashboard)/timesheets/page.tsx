import { api } from "@/trpc/server";
import { TimesheetTable } from "@/components/timesheets/TimesheetTable";

export default async function TimesheetsPage() {
  const { items: projects } = await api.projects.list({ includeArchived: true, pageSize: 100 });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Timesheets</h1>
      </div>

      {/* Table card */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Time Tracking
          </p>
          <p className="text-base font-semibold mt-0.5">All Time Entries</p>
        </div>
        <div className="p-4">
          <TimesheetTable projects={projects} />
        </div>
      </div>
    </div>
  );
}

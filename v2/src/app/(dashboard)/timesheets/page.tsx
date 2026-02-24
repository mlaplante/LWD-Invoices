import { api } from "@/trpc/server";
import { TimesheetTable } from "@/components/timesheets/TimesheetTable";

export default async function TimesheetsPage() {
  const projects = await api.projects.list({ includeArchived: true });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Timesheets</h1>
      <TimesheetTable projects={projects} />
    </div>
  );
}

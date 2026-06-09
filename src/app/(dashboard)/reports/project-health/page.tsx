import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const BAND_STYLES: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700",
  stable: "bg-blue-50 text-blue-700",
  at_risk: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
};

const BAND_LABELS: Record<string, string> = {
  healthy: "Healthy",
  stable: "Stable",
  at_risk: "At risk",
  critical: "Critical",
};

const COMPONENT_LABELS: Record<string, string> = {
  budgetBurn: "Budget",
  overdueTasks: "Tasks",
  unbilledTime: "Unbilled",
  unpaidInvoices: "Invoices",
  responseRate: "Response",
};

export default async function ProjectHealthReportPage() {
  const [data, org] = await Promise.all([
    api.projects.healthScores(),
    api.organization.get(),
  ]);

  const scores = data.scores;
  const atRiskCount = scores.filter(
    (s) => s.band === "at_risk" || s.band === "critical"
  ).length;

  const generatedLabel = data.generatedAt
    ? new Date(data.generatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Now";

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Project Health"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={generatedLabel}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="text-muted-foreground hover:text-foreground transition-colors print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Project Health</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Summary cards */}
      {scores.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Projects Scored
            </p>
            <p className="text-2xl font-bold mt-1">{scores.length}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              At Risk / Critical
            </p>
            <p className={`text-2xl font-bold mt-1 ${atRiskCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {atRiskCount}
            </p>
          </div>
        </div>
      )}

      {scores.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card px-6 py-12 text-center text-muted-foreground text-sm">
          No projects to score yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/50">
                <tr className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-3 text-left">Project</th>
                  <th className="px-5 py-3 text-left">Client</th>
                  <th className="px-5 py-3 text-right">Score</th>
                  <th className="px-5 py-3 text-left">Band</th>
                  <th className="px-5 py-3 text-left">Components</th>
                  <th className="px-5 py-3 text-left">Signals</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => {
                  const components = s.components as Record<
                    string,
                    { score: number; weight: number; detail: string }
                  >;
                  // Find weakest component
                  const weakest = Object.entries(components).reduce<
                    [string, { score: number; weight: number; detail: string }] | null
                  >((min, entry) =>
                    min === null || entry[1].score < min[1].score ? entry : min
                  , null);

                  return (
                    <tr
                      key={s.projectId}
                      className="border-b border-border/50 last:border-0 align-top hover:bg-accent/30"
                    >
                      <td className="px-5 py-3 font-medium">
                        <Link
                          href={`/projects/${s.projectId}`}
                          className="hover:text-primary transition-colors"
                        >
                          {s.projectName}
                        </Link>
                        {s.lowData && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            low data
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{s.clientName}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-bold">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${BAND_STYLES[s.band]}`}>
                          {s.score}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${BAND_STYLES[s.band]}`}>
                          {BAND_LABELS[s.band]}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {Object.entries(components).map(([key, comp]) => (
                            <span
                              key={key}
                              title={comp.detail}
                              className="text-[11px] tabular-nums text-muted-foreground"
                            >
                              <span className="font-medium text-foreground">{COMPONENT_LABELS[key]}</span>{" "}
                              {comp.score}
                            </span>
                          ))}
                        </div>
                        {weakest && weakest[1].score < 60 && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Weakest: {COMPONENT_LABELS[weakest[0]] ?? weakest[0]} — {weakest[1].detail}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs">
                        {s.signals.length > 0 ? (
                          <ul className="space-y-0.5">
                            {s.signals.map((sig, i) => (
                              <li key={i}>• {sig}</li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

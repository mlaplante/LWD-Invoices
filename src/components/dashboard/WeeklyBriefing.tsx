import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";

type BriefingData = {
  weekLabel: string;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  overdueInvoices: {
    count: number;
    totalAmount: number;
  };
  expenseAnomalies: {
    count: number;
    details: string[];
  };
  upcomingRenewals: {
    count: number;
    clients: string[];
  };
  recommendedActions: string[];
};

type Props = {
  data: BriefingData | null;
  error: Error | null;
};

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The briefing reads as prose, not as a grid of tiles — that's the point
 * of leading the dashboard with it. These sentences are assembled from
 * the same payload the emailed briefing uses, so the two stay in step.
 *
 * Returned as fragments so the headline figure can carry a <strong>.
 */
function narrative(data: BriefingData): React.ReactNode[] {
  const lines: React.ReactNode[] = [];

  const cashSentence =
    data.cashIn === 0 && data.cashOut === 0
      ? "Quiet week on cash: nothing in, nothing out."
      : `Cash moved ${fmt(data.cashIn)} in and ${fmt(data.cashOut)} out — net ${fmt(data.netCashFlow)}.`;
  lines.push(<span key="cash">{cashSentence} </span>);

  if (data.overdueInvoices.count > 0) {
    lines.push(
      <span key="overdue">
        <strong className="font-semibold">
          {fmt(data.overdueInvoices.totalAmount)} across{" "}
          {plural(data.overdueInvoices.count, "invoice")} is overdue
        </strong>{" "}
        — chasing it is the highest-value move this week.{" "}
      </span>,
    );
  } else {
    lines.push(
      <span key="overdue">
        <strong className="font-semibold">Nothing is overdue.</strong>{" "}
      </span>,
    );
  }

  if (data.upcomingRenewals.count > 0) {
    lines.push(
      <span key="renewals">
        {plural(data.upcomingRenewals.count, "client")} need attention on
        renewal: {data.upcomingRenewals.clients.slice(0, 3).join(", ")}.{" "}
      </span>,
    );
  }

  if (data.expenseAnomalies.count > 0) {
    lines.push(
      <span key="anomalies">
        {plural(data.expenseAnomalies.count, "expense anomaly")} flagged for
        review.
      </span>,
    );
  }

  return lines;
}

function EmptyBriefing() {
  return (
    <div className="flex min-h-[140px] items-center justify-center rounded-[10px] border border-border bg-card p-6">
      <div className="space-y-1.5 text-center">
        <AlertCircle className="mx-auto size-8 text-muted-foreground/40" />
        <p className="text-[13px] font-medium text-muted-foreground">
          No briefing for this period yet
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          briefings generate monday 8:00am once there is enough activity
        </p>
      </div>
    </div>
  );
}

function ErrorBriefing({ error }: { error: Error }) {
  return (
    <div
      className="rounded-[10px] border border-danger/30 bg-danger/[0.04] p-5"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger-foreground" />
        <div>
          <p className="text-[13px] font-medium text-danger-foreground">
            Briefing load failed
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {error.message}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard hero. Solid indigo with an inset vignette — the only element
 * on the page allowed that much colour, which is what makes the briefing
 * read as the dashboard's thesis rather than one card among many.
 */
export function WeeklyBriefing({ data, error }: Props) {
  if (error) return <ErrorBriefing error={error} />;
  if (!data) return <EmptyBriefing />;

  const generatedLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <section className="hero-indigo flex flex-col gap-5 px-7 py-6 md:flex-row md:items-center md:gap-8">
      <div className="min-w-0 flex-1">
        <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[2px] text-white/70">
          weekly business briefing · {data.weekLabel}
        </p>
        <p className="text-[15px] leading-[1.6]">{narrative(data)}</p>

        {data.recommendedActions.length > 0 && (
          <ul className="mt-3 space-y-1">
            {data.recommendedActions.slice(0, 2).map((action, i) => (
              <li
                key={i}
                className="flex items-start gap-2 font-mono text-[10px] text-white/70"
              >
                <span className="mt-1 size-1 shrink-0 rounded-full bg-white/50" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <Link
          href="/assistant"
          className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-white/45 px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[2px] text-white transition-colors duration-200 ease-[ease] hover:bg-white/12"
        >
          Read full briefing
          <ArrowRight className="size-3.5" />
        </Link>
        <span className="text-center font-mono text-[9.5px] text-white/55">
          generated {generatedLabel} 8:00am
        </span>
      </div>
    </section>
  );
}

import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/projects/TaskList";
import { TimeTab } from "@/components/projects/TimeTab";
import { ExpensesTab } from "@/components/projects/ExpensesTab";
import { AttachmentPanel } from "@/components/attachments/AttachmentPanel";
import { DiscussionThread } from "@/components/projects/DiscussionThread";
import { MilestoneList } from "@/components/projects/MilestoneList";
import type { ProjectStatus } from "@/generated/prisma";
import {
  ArrowLeft,
  Pencil,
  CheckSquare,
  Clock,
  DollarSign,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ProjectStatus, { label: string; className: string }> = {
  ACTIVE:    { label: "Active",    className: "bg-emerald-50 text-emerald-600" },
  COMPLETED: { label: "Completed", className: "bg-primary/10 text-primary" },
  ARCHIVED:  { label: "Archived",  className: "bg-gray-100 text-gray-500" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const TABS = [
  { key: "tasks",       label: "Tasks" },
  { key: "milestones",  label: "Milestones" },
  { key: "time",        label: "Time" },
  { key: "expenses",    label: "Expenses" },
  { key: "files",       label: "Files" },
  { key: "discussions", label: "Discussions" },
];

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = "tasks" } = await searchParams;

  let project;
  try {
    project = await api.projects.get({ id });
  } catch {
    notFound();
  }

  const badge = STATUS_BADGE[project.status];

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/projects"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Projects
            </Link>
            <span className="text-border/70 text-sm">/</span>
            <span className="text-sm text-muted-foreground truncate">
              {project.client.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight truncate">
              {project.name}
            </h1>
            <span
              className={cn(
                "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0",
                badge.className
              )}
            >
              {badge.label}
            </span>
          </div>
          {project.description && (
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xl leading-relaxed">
              {project.description}
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={`/projects/${id}/edit`}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Link>
        </Button>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<CheckSquare className="w-4 h-4" />}
          label="Tasks"
          value={String(project._count.tasks)}
          color="text-violet-600 bg-violet-50"
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Client"
          value={project.client.name}
          small
          color="text-blue-600 bg-blue-50"
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Time Logged"
          value={`${(project.summary.totalMinutes / 60).toFixed(1)}h`}
          color="text-amber-600 bg-amber-50"
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Expenses"
          value={`${project.currency.symbol}${project.summary.totalExpenses.toFixed(2)}`}
          color="text-emerald-600 bg-emerald-50"
        />
      </div>

      {/* ── Tab nav ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/projects/${id}?tab=${t.key}`}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative",
              tab === t.key
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </Link>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      {tab === "tasks" && <TaskList project={project} />}
      {tab === "milestones" && <MilestoneList projectId={id} />}
      {tab === "time" && <TimeTab projectId={id} />}
      {tab === "expenses" && <ExpensesTab projectId={id} />}
      {tab === "files" && (
        <div className="rounded-2xl border border-border/50 p-5">
          <AttachmentPanel context="PROJECT" contextId={id} />
        </div>
      )}
      {tab === "discussions" && (
        <div className="rounded-2xl border border-border/50 p-5">
          <DiscussionThread projectId={project.id} />
        </div>
      )}
    </div>
  );
}

// ── Stat card component ───────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  small = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 flex items-start gap-3">
      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p
          className={cn(
            "font-bold mt-0.5 truncate",
            small ? "text-sm" : "text-lg"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

import { inngest } from "../client";
import { db } from "@/server/db";
import { notifyOrgAdmins } from "@/server/services/notifications";
import {
  budgetAlertCopy,
  evaluateBudgetAlert,
} from "@/server/services/project-budget-alerts";

/**
 * Daily project budget alerts: warns org admins when an active project's
 * logged hours cross 80% ("approaching") or 100% ("exceeded") of its
 * projectedHours budget. Sent-markers on the Project row keep each threshold
 * to one alert, and are cleared automatically when the budget is raised so
 * the project can alert again later.
 */
export const processProjectBudgetAlerts = inngest.createFunction(
  {
    id: "process-project-budget-alerts",
    name: "Process Project Budget Alerts",
    triggers: [{ cron: "0 9 * * *" }], // daily at 9am UTC, after the 8am reminder crons
  },
  async () => {
    const projects = await db.project.findMany({
      where: { status: "ACTIVE", projectedHours: { gt: 0 } },
      select: {
        id: true,
        name: true,
        projectedHours: true,
        budgetAlert80SentAt: true,
        budgetAlert100SentAt: true,
        organizationId: true,
      },
    });
    if (projects.length === 0) return { processed: 0, alerted: 0 };

    const minuteSums = await db.timeEntry.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projects.map((p) => p.id) } },
      _sum: { minutes: true },
    });
    const minutesByProject = new Map(
      minuteSums.map((row) => [row.projectId, row._sum.minutes?.toNumber() ?? 0]),
    );

    let alerted = 0;
    const results = await Promise.allSettled(
      projects.map(async (project) => {
        const loggedHours = (minutesByProject.get(project.id) ?? 0) / 60;
        const evaluation = evaluateBudgetAlert({
          projectedHours: project.projectedHours,
          loggedHours,
          alert80SentAt: project.budgetAlert80SentAt,
          alert100SentAt: project.budgetAlert100SentAt,
        });

        const now = new Date();
        const data: Record<string, Date | null> = {};
        if (evaluation.clear80) data.budgetAlert80SentAt = null;
        if (evaluation.clear100) data.budgetAlert100SentAt = null;
        if (evaluation.alert === "approaching") data.budgetAlert80SentAt = now;
        if (evaluation.alert === "exceeded") data.budgetAlert100SentAt = now;
        if (Object.keys(data).length > 0) {
          await db.project.update({ where: { id: project.id }, data });
        }

        if (evaluation.alert) {
          const copy = budgetAlertCopy({
            projectName: project.name,
            percentUsed: evaluation.percentUsed,
            loggedHours,
            projectedHours: project.projectedHours,
            alert: evaluation.alert,
          });
          await notifyOrgAdmins(project.organizationId, {
            type: "PROJECT_BUDGET_ALERT",
            title: copy.title,
            body: copy.body,
            link: `/projects/${project.id}`,
          });
          alerted++;
        }
      }),
    );

    return {
      processed: projects.length,
      alerted,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  },
);

import { inngest } from "../client";
import { db } from "@/server/db";
import { evaluateAutoCreditHolds } from "@/server/services/credit-hold";
import { notifyOrgAdmins } from "@/server/services/notifications";

/**
 * Daily auto-credit-hold evaluation. For every org with at least one client on
 * the auto-hold policy, re-score health and place/release auto-holds. Newly
 * placed holds notify org admins so the decision is visible. Releases are
 * silent (the client recovered — nothing to action).
 */
export const processCreditHoldEvaluation = inngest.createFunction(
  { id: "process-credit-hold-evaluation", name: "Process Credit Hold Evaluation", triggers: [{ cron: "0 8 * * *" }] }, // daily 08:00 UTC
  async () => {
    const now = new Date();

    // Only touch orgs that actually use the policy.
    const orgs = await db.client.groupBy({
      by: ["organizationId"],
      where: { autoCreditHoldEnabled: true, autoCreditHoldThreshold: { not: null }, isArchived: false },
    });

    let held = 0;
    let released = 0;
    let failed = 0;

    for (const { organizationId } of orgs) {
      try {
        const result = await evaluateAutoCreditHolds(db, organizationId, now);
        held += result.held;
        released += result.released;

        for (const change of result.changes) {
          if (change.action !== "held") continue;
          await notifyOrgAdmins(organizationId, {
            type: "CREDIT_HOLD_PLACED",
            title: `Credit hold placed on ${change.clientName}`,
            body: `Health score ${change.score} fell below the ${change.threshold} threshold — placed on auto credit hold.`,
            link: `/clients/${change.clientId}`,
          }).catch(() => {});
        }
      } catch (err) {
        console.error(`[credit-hold-evaluation] Failed for org ${organizationId}:`, err);
        failed++;
      }
    }

    return { orgs: orgs.length, held, released, failed };
  },
);

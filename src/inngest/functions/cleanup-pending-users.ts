import { inngest } from "../client";
import { db } from "@/server/db";

// Users created via Clerk webhook get organizationId: "__pending__" because Clerk
// doesn't include org context on user.created. If they never complete onboarding,
// they remain as orphaned records. Clean them up after 7 days.
export const cleanupPendingUsers = inngest.createFunction(
  { id: "cleanup-pending-users", name: "Cleanup Pending Users" },
  { cron: "0 3 * * *" }, // daily at 3am UTC
  async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { count } = await db.user.deleteMany({
      where: {
        organizationId: "__pending__",
        createdAt: { lt: cutoff },
      },
    });

    console.log(`[cleanup-pending-users] Deleted ${count} stale pending users`);
    return { deleted: count };
  }
);

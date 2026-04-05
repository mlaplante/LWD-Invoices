import { db } from "../db";
import { NotificationType } from "@/generated/prisma";

interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  userId: string;
  organizationId: string;
}

export async function createNotification(input: CreateNotificationInput) {
  return db.notification.create({ data: input });
}

export async function notifyOrgAdmins(
  orgId: string,
  notification: Omit<CreateNotificationInput, "userId" | "organizationId">,
) {
  const org = await db.organization.findFirst({
    where: { id: orgId },
    include: { members: { where: { role: "ADMIN" }, include: { user: true } } },
  });
  if (!org) return;

  await Promise.all(
    org.members.map((m) =>
      createNotification({
        ...notification,
        userId: m.user.supabaseId ?? m.user.id,
        organizationId: org.id,
      }),
    ),
  );
}

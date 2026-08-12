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
  await notifyOrgAdminsMany(orgId, [notification]);
}

/**
 * Batched variant for bulk operations: one admin lookup + one createMany
 * regardless of how many notifications are being fanned out. Each admin
 * still receives every notification in the list.
 */
export async function notifyOrgAdminsMany(
  orgId: string,
  notifications: Omit<CreateNotificationInput, "userId" | "organizationId">[],
) {
  if (notifications.length === 0) return;

  const org = await db.organization.findFirst({
    where: { id: orgId },
    select: {
      id: true,
      members: {
        where: { role: "ADMIN" },
        select: { user: { select: { id: true, supabaseId: true } } },
      },
    },
  });
  if (!org || org.members.length === 0) return;

  await db.notification.createMany({
    data: org.members.flatMap((m) =>
      notifications.map((notification) => ({
        ...notification,
        userId: m.user.supabaseId ?? m.user.id,
        organizationId: org.id,
      })),
    ),
  });
}

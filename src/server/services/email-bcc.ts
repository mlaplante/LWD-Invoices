import { db } from "@/server/db";

/**
 * Returns the owner's email address for BCC if the org has emailBccOwner enabled.
 * Returns undefined if disabled or no owner found.
 */
export async function getOwnerBcc(organizationId: string): Promise<string | undefined> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      emailBccOwner: true,
      users: {
        where: { role: "OWNER" },
        select: { email: true },
        take: 1,
      },
    },
  });

  if (!org?.emailBccOwner || !org.users[0]?.email) return undefined;
  return org.users[0].email;
}

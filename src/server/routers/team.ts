import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole, publicProcedure } from "../trpc";
import { logAudit } from "../services/audit";
import { render } from "@react-email/render";
import TeamInviteEmail from "@/emails/TeamInviteEmail";
import PasswordResetEmail from "@/emails/PasswordResetEmail";
import { sendEmail } from "@/server/services/email-sender";

export const teamRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.userOrganization.findMany({
      where: { organizationId: ctx.orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      ...m.user,
      role: m.role,
      membershipId: m.id,
    }));
  }),

  updateProfile: protectedProcedure.input(
    z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().max(100).optional(),
    })
  ).mutation(async ({ ctx, input }) => {
    return ctx.db.user.updateMany({
      where: { supabaseId: ctx.userId },
      data: { firstName: input.firstName, lastName: input.lastName ?? null },
    });
  }),

  invite: requireRole("OWNER", "ADMIN").input(
    z.object({
      email: z.string().email(),
      role: z.enum(["ADMIN", "ACCOUNTANT", "VIEWER"]),
    })
  ).mutation(async ({ ctx, input }) => {
    const existingMember = await ctx.db.userOrganization.findFirst({
      where: { organizationId: ctx.orgId, user: { email: input.email } },
    });
    if (existingMember) {
      throw new TRPCError({ code: "CONFLICT", message: "This person is already a member of your organization" });
    }

    await ctx.db.invitation.updateMany({
      where: { email: input.email, organizationId: ctx.orgId, status: "PENDING" },
      data: { status: "REVOKED" },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await ctx.db.invitation.create({
      data: {
        email: input.email,
        role: input.role,
        expiresAt,
        invitedById: ctx.userId,
        organizationId: ctx.orgId,
      },
    });

    const [inviter, org] = await Promise.all([
      ctx.db.user.findFirst({ where: { supabaseId: ctx.userId }, select: { firstName: true, lastName: true, email: true } }),
      ctx.db.organization.findFirst({ where: { id: ctx.orgId }, select: { name: true, logoUrl: true } }),
    ]);

    const inviterName = inviter?.firstName
      ? `${inviter.firstName}${inviter.lastName ? ` ${inviter.lastName}` : ""}`
      : inviter?.email ?? "Someone";

    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`;

    const html = await render(
      TeamInviteEmail({
        inviterName,
        orgName: org?.name ?? "your organization",
        role: input.role,
        acceptUrl,
        logoUrl: org?.logoUrl,
      })
    );

    await sendEmail({
      organizationId: ctx.orgId,
      to: input.email,
      subject: `${inviterName} invited you to join ${org?.name ?? "their organization"} on Pancake`,
      html,
    });

    await logAudit({
      action: "CREATED",
      entityType: "Invitation",
      entityId: invitation.id,
      entityLabel: `Invited ${input.email} as ${input.role}`,
      userId: ctx.userId,
      organizationId: ctx.orgId,
    });

    return { inviteUrl: acceptUrl, invitation };
  }),

  pendingInvites: requireRole("OWNER", "ADMIN").query(async ({ ctx }) => {
    return ctx.db.invitation.findMany({
      where: { organizationId: ctx.orgId, status: "PENDING" },
      include: {
        invitedBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  resendInvite: requireRole("OWNER", "ADMIN").input(
    z.object({ invitationId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.invitation.findFirst({
      where: { id: input.invitationId, organizationId: ctx.orgId, status: "PENDING" },
    });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    }

    await ctx.db.invitation.update({
      where: { id: existing.id },
      data: { status: "REVOKED" },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await ctx.db.invitation.create({
      data: {
        email: existing.email,
        role: existing.role,
        expiresAt,
        invitedById: ctx.userId,
        organizationId: ctx.orgId,
      },
    });

    const [inviter, org] = await Promise.all([
      ctx.db.user.findFirst({ where: { supabaseId: ctx.userId }, select: { firstName: true, lastName: true, email: true } }),
      ctx.db.organization.findFirst({ where: { id: ctx.orgId }, select: { name: true, logoUrl: true } }),
    ]);

    const inviterName = inviter?.firstName
      ? `${inviter.firstName}${inviter.lastName ? ` ${inviter.lastName}` : ""}`
      : inviter?.email ?? "Someone";

    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`;

    const html = await render(
      TeamInviteEmail({
        inviterName,
        orgName: org?.name ?? "your organization",
        role: existing.role,
        acceptUrl,
        logoUrl: org?.logoUrl,
      })
    );

    await sendEmail({
      organizationId: ctx.orgId,
      to: existing.email,
      subject: `${inviterName} invited you to join ${org?.name ?? "their organization"} on Pancake`,
      html,
    });

    return { inviteUrl: acceptUrl };
  }),

  revokeInvite: requireRole("OWNER", "ADMIN").input(
    z.object({ invitationId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const invitation = await ctx.db.invitation.findFirst({
      where: { id: input.invitationId, organizationId: ctx.orgId, status: "PENDING" },
    });
    if (!invitation) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    }
    return ctx.db.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });
  }),

  changeRole: requireRole("OWNER", "ADMIN").input(
    z.object({
      userId: z.string(),
      role: z.enum(["OWNER", "ADMIN", "ACCOUNTANT", "VIEWER"]),
    })
  ).mutation(async ({ ctx, input }) => {
    const targetMembership = await ctx.db.userOrganization.findFirst({
      where: { userId: input.userId, organizationId: ctx.orgId },
      include: { user: { select: { id: true, supabaseId: true, email: true } } },
    });
    if (!targetMembership) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    if (targetMembership.user.supabaseId === ctx.userId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role" });
    }

    if (targetMembership.role === "OWNER" && input.role !== "OWNER") {
      const ownerCount = await ctx.db.userOrganization.count({
        where: { organizationId: ctx.orgId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot demote the last owner" });
      }
    }

    if (input.role === "OWNER" && ctx.userRole !== "OWNER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can promote to owner" });
    }

    await ctx.db.userOrganization.update({
      where: { id: targetMembership.id },
      data: { role: input.role },
    });

    const updated = targetMembership.user;

    // Sync role to app_metadata so middleware/layout can read it without a DB query
    if (updated.supabaseId) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const adminClient = createAdminClient();
      await adminClient.auth.admin.updateUserById(updated.supabaseId, {
        app_metadata: { userRole: input.role },
      });
    }

    await logAudit({
      action: "UPDATED",
      entityType: "User",
      entityId: input.userId,
      entityLabel: `Role changed to ${input.role}`,
      userId: ctx.userId,
      organizationId: ctx.orgId,
    });

    return updated;
  }),

  removeMember: requireRole("OWNER", "ADMIN").input(
    z.object({ userId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const targetMembership = await ctx.db.userOrganization.findFirst({
      where: { userId: input.userId, organizationId: ctx.orgId },
      include: { user: { select: { id: true, supabaseId: true } } },
    });
    if (!targetMembership) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    if (targetMembership.user.supabaseId === ctx.userId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove yourself" });
    }

    if (targetMembership.role === "OWNER") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove an owner. Demote them first." });
    }

    const deleted = await ctx.db.userOrganization.delete({ where: { id: targetMembership.id } });

    await logAudit({
      action: "DELETED",
      entityType: "User",
      entityId: input.userId,
      entityLabel: `Member removed`,
      userId: ctx.userId,
      organizationId: ctx.orgId,
    });

    return deleted;
  }),

  sendPasswordReset: requireRole("OWNER", "ADMIN").input(
    z.object({ userId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const membership = await ctx.db.userOrganization.findFirst({
      where: { userId: input.userId, organizationId: ctx.orgId },
      include: { user: true },
    });
    const targetUser = membership?.user;
    if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    if (targetUser.supabaseId === ctx.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "Use settings to change your own password" });
    if (!targetUser.supabaseId) throw new TRPCError({ code: "BAD_REQUEST", message: "User has no auth account linked" });

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password` },
    });

    if (linkError || !linkData?.properties?.action_link) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate reset link" });
    }

    const org = await ctx.db.organization.findFirst({
      where: { id: ctx.orgId },
      select: { name: true, logoUrl: true },
    });

    const html = await render(PasswordResetEmail({
      resetUrl: linkData.properties.action_link,
      orgName: org?.name ?? "your organization",
      logoUrl: org?.logoUrl,
    }));

    await sendEmail({
      organizationId: ctx.orgId,
      to: targetUser.email,
      subject: `Password reset for ${org?.name ?? "your organization"}`,
      html,
    });

    return { success: true };
  }),

  suspend: requireRole("OWNER", "ADMIN").input(
    z.object({ userId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const membership = await ctx.db.userOrganization.findFirst({
      where: { userId: input.userId, organizationId: ctx.orgId },
      include: { user: true },
    });
    const targetUser = membership?.user;
    if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    if (targetUser.supabaseId === ctx.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot suspend yourself" });
    if (membership?.role === "OWNER") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot suspend an owner" });
    const suspended = await ctx.db.user.update({
      where: { id: input.userId },
      data: { isActive: false },
    });

    await logAudit({
      action: "UPDATED",
      entityType: "User",
      entityId: input.userId,
      entityLabel: "User suspended",
      userId: ctx.userId,
      organizationId: ctx.orgId,
    });

    return suspended;
  }),

  reactivate: requireRole("OWNER", "ADMIN").input(
    z.object({ userId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const membership = await ctx.db.userOrganization.findFirst({
      where: { userId: input.userId, organizationId: ctx.orgId },
      include: { user: true },
    });
    const targetUser = membership?.user;
    if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    const reactivated = await ctx.db.user.update({
      where: { id: input.userId },
      data: { isActive: true },
    });

    await logAudit({
      action: "UPDATED",
      entityType: "User",
      entityId: input.userId,
      entityLabel: "User reactivated",
      userId: ctx.userId,
      organizationId: ctx.orgId,
    });

    return reactivated;
  }),

  acceptInvite: protectedProcedure.input(
    z.object({ token: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const invitation = await ctx.db.invitation.findUnique({
      where: { token: input.token },
      include: { organization: { select: { name: true } } },
    });

    if (!invitation) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    }
    if (invitation.status !== "PENDING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `This invitation has been ${invitation.status.toLowerCase()}` });
    }
    if (invitation.expiresAt < new Date()) {
      await ctx.db.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired" });
    }

    const existingUser = await ctx.db.user.findFirst({
      where: { supabaseId: ctx.userId },
    });

    if (existingUser) {
      // Check if user is already a member of this specific org
      const existingMembership = await ctx.db.userOrganization.findFirst({
        where: { userId: existingUser.id, organizationId: invitation.organizationId },
      });
      if (existingMembership) {
        throw new TRPCError({ code: "CONFLICT", message: "You are already a member of this organization" });
      }

      await ctx.db.userOrganization.create({
        data: {
          userId: existingUser.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });
    } else {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const newUser = await ctx.db.user.create({
        data: {
          supabaseId: ctx.userId,
          email: invitation.email,
          firstName: user?.user_metadata?.firstName ?? null,
          lastName: user?.user_metadata?.lastName ?? null,
        },
      });

      await ctx.db.userOrganization.create({
        data: {
          userId: newUser.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (authUser) {
      await adminClient.auth.admin.updateUserById(authUser.id, {
        app_metadata: {
          organizationId: invitation.organizationId,
          orgName: invitation.organization.name,
          userRole: invitation.role,
        },
      });
    }

    await ctx.db.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    });

    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.set("activeOrgId", invitation.organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return { organizationName: invitation.organization.name };
  }),

  validateToken: publicProcedure.input(
    z.object({ token: z.string() })
  ).query(async ({ ctx, input }) => {
    const invitation = await ctx.db.invitation.findUnique({
      where: { token: input.token },
      include: {
        organization: { select: { name: true, logoUrl: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invitation) return { valid: false as const, reason: "not_found" as const };
    if (invitation.status !== "PENDING") return { valid: false as const, reason: invitation.status.toLowerCase() as "accepted" | "expired" | "revoked" };
    if (invitation.expiresAt < new Date()) return { valid: false as const, reason: "expired" as const };

    return {
      valid: true as const,
      email: invitation.email,
      role: invitation.role,
      orgName: invitation.organization.name,
      orgLogoUrl: invitation.organization.logoUrl,
      inviterName: invitation.invitedBy.firstName
        ? `${invitation.invitedBy.firstName}${invitation.invitedBy.lastName ? ` ${invitation.invitedBy.lastName}` : ""}`
        : "Someone",
    };
  }),
});

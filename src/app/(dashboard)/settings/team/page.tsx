import { api } from "@/trpc/server";
import { InviteForm } from "@/components/team/InviteForm";
import { TeamMemberList } from "@/components/team/TeamMemberList";
import { PendingInvitationList } from "@/components/team/PendingInvitationList";

export default async function TeamSettingsPage() {
  const [members, org] = await Promise.all([
    api.team.list(),
    api.organization.get(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage team members and invitations for {org.name}.
        </p>
      </div>
      <InviteForm />
      <PendingInvitationList />
      <TeamMemberList members={members} />
    </div>
  );
}

"use client";

import { trpc } from "@/trpc/client";
import { toast } from "sonner";

export function PendingInvitationList() {
  const { data: invitations } = trpc.team.pendingInvites.useQuery();
  const utils = trpc.useUtils();

  const resendMutation = trpc.team.resendInvite.useMutation({
    onSuccess: () => {
      toast.success("Invitation resent!");
      utils.team.pendingInvites.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = trpc.team.revokeInvite.useMutation({
    onSuccess: () => {
      toast.success("Invitation revoked");
      utils.team.pendingInvites.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!invitations || invitations.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50">
        <p className="text-sm font-semibold">Pending Invitations</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expires</th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {invitations.map((inv) => (
            <tr key={inv.id} className="hover:bg-accent/20 transition-colors">
              <td className="px-6 py-3.5 font-medium">{inv.email}</td>
              <td className="px-6 py-3.5 text-muted-foreground">
                {inv.role.charAt(0) + inv.role.slice(1).toLowerCase()}
              </td>
              <td className="px-6 py-3.5 text-muted-foreground text-xs">
                {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
              <td className="px-6 py-3.5 text-right space-x-2">
                <button
                  type="button"
                  onClick={() => resendMutation.mutate({ invitationId: inv.id })}
                  disabled={resendMutation.isPending}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => revokeMutation.mutate({ invitationId: inv.id })}
                  disabled={revokeMutation.isPending}
                  className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

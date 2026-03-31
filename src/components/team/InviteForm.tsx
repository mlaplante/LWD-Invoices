"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "ACCOUNTANT" | "VIEWER">("VIEWER");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const utils = api.useUtils();
  const inviteMutation = api.team.invite.useMutation({
    onSuccess: (data) => {
      toast.success("Invitation sent!");
      setInviteUrl(data.inviteUrl);
      setEmail("");
      utils.team.pendingInvites.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <h2 className="text-sm font-semibold mb-4">Invite a Team Member</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setInviteUrl(null);
          inviteMutation.mutate({ email, role });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="invite-email" className="text-xs text-muted-foreground font-medium">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="text-xs text-muted-foreground font-medium">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ADMIN">Admin</option>
            <option value="ACCOUNTANT">Accountant</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={inviteMutation.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {inviteMutation.isPending ? "Sending..." : "Send Invite"}
        </button>
      </form>
      {inviteUrl && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Or share this link:</span>
          <code className="bg-muted px-2 py-1 rounded text-[11px] truncate max-w-[300px]">{inviteUrl}</code>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("Link copied!"); }}
            className="shrink-0 hover:text-foreground transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

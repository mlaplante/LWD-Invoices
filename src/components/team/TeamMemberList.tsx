"use client";

import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { useState } from "react";
import type { UserRole } from "@/generated/prisma";

type Member = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  createdAt: Date;
  isActive: boolean;
};

export function TeamMemberList({ members: initialMembers }: { members: Member[] }) {
  const { data: members } = trpc.team.list.useQuery(undefined, {
    initialData: initialMembers,
  });
  const [removingId, setRemovingId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const changeRoleMutation = trpc.team.changeRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.team.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPasswordMutation = trpc.team.sendPasswordReset.useMutation({
    onSuccess: () => toast.success("Password reset email sent"),
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.team.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      setRemovingId(null);
      utils.team.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const suspendMutation = trpc.team.suspend.useMutation({
    onSuccess: () => { toast.success("Member suspended"); utils.team.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const reactivateMutation = trpc.team.reactivate.useMutation({
    onSuccess: () => { toast.success("Member reactivated"); utils.team.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50">
        <p className="text-sm font-semibold">Team Members</p>
        <p className="text-xs text-muted-foreground mt-0.5">{members.length} members</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-accent/20 transition-colors">
              <td className="px-6 py-3.5 font-medium">
                {m.firstName || m.lastName
                  ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim()
                  : "\u2014"}
                {!m.isActive && (
                  <span className="ml-2 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-600">
                    Suspended
                  </span>
                )}
              </td>
              <td className="px-6 py-3.5 text-muted-foreground">{m.email}</td>
              <td className="px-6 py-3.5">
                <select
                  value={m.role}
                  onChange={(e) => changeRoleMutation.mutate({ userId: m.id, role: e.target.value as "OWNER" | "ADMIN" | "ACCOUNTANT" | "VIEWER" })}
                  className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="ACCOUNTANT">Accountant</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </td>
              <td className="px-6 py-3.5 text-muted-foreground text-xs">
                {new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </td>
              <td className="px-6 py-3.5 text-right">
                {m.role !== "OWNER" && (
                  <>
                    {m.isActive ? (
                      <button type="button" onClick={() => suspendMutation.mutate({ userId: m.id })} className="text-xs text-amber-600 hover:text-amber-700 transition-colors mr-3">
                        Suspend
                      </button>
                    ) : (
                      <button type="button" onClick={() => reactivateMutation.mutate({ userId: m.id })} className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors mr-3">
                        Reactivate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => resetPasswordMutation.mutate({ userId: m.id })}
                      disabled={resetPasswordMutation.isPending}
                      className="text-xs text-primary hover:text-primary/80 transition-colors mr-3"
                    >
                      {resetPasswordMutation.isPending ? "Sending\u2026" : "Reset password"}
                    </button>
                    {removingId === m.id ? (
                      <span className="space-x-2">
                        <button type="button" onClick={() => removeMutation.mutate({ userId: m.id })} className="text-xs text-destructive font-medium">Confirm</button>
                        <button type="button" onClick={() => setRemovingId(null)} className="text-xs text-muted-foreground">Cancel</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setRemovingId(m.id)} className="text-xs text-destructive hover:text-destructive/80 transition-colors">Remove</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

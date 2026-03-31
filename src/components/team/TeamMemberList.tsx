"use client";

import { api } from "@/trpc/react";
import { toast } from "sonner";
import { useState } from "react";

type Member = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: Date;
};

export function TeamMemberList({ members: initialMembers }: { members: Member[] }) {
  const { data: members } = api.team.list.useQuery(undefined, {
    initialData: initialMembers,
  });
  const [removingId, setRemovingId] = useState<string | null>(null);

  const utils = api.useUtils();

  const changeRoleMutation = api.team.changeRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.team.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = api.team.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      setRemovingId(null);
      utils.team.list.invalidate();
    },
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

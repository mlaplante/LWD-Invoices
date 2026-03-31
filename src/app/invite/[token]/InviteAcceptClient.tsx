"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

type Props = {
  token: string;
  orgName: string;
  orgLogoUrl?: string | null;
  inviterName: string;
  role: string;
};

export function InviteAcceptClient({ token, orgName, orgLogoUrl, inviterName, role }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const acceptMutation = api.team.acceptInvite.useMutation({
    onSuccess: () => {
      router.push("/");
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const roleName = role.charAt(0) + role.slice(1).toLowerCase();

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
      {orgLogoUrl && (
        <img src={orgLogoUrl} alt={orgName} className="h-12 w-auto mx-auto mb-4" />
      )}
      <h1 className="text-xl font-bold mb-2">Join {orgName}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {inviterName} invited you to join as {role === "ADMIN" ? "an" : "a"} <strong>{roleName}</strong>.
      </p>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      <button
        onClick={() => acceptMutation.mutate({ token })}
        disabled={acceptMutation.isPending}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {acceptMutation.isPending ? "Joining..." : "Accept Invitation"}
      </button>
    </div>
  );
}

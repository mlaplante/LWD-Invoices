import { api } from "@/trpc/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteAcceptClient } from "./InviteAcceptClient";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await api.team.validateToken({ token });

  if (!result.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-4">
          <div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
            <h1 className="text-xl font-bold mb-2">Invalid Invitation</h1>
            <p className="text-sm text-muted-foreground">
              {result.reason === "not_found" && "This invitation link is invalid."}
              {result.reason === "expired" && "This invitation has expired. Ask the sender to resend it."}
              {result.reason === "accepted" && "This invitation has already been accepted."}
              {result.reason === "revoked" && "This invitation has been revoked."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?redirect=/invite/${token}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <InviteAcceptClient
          token={token}
          orgName={result.orgName}
          orgLogoUrl={result.orgLogoUrl}
          inviterName={result.inviterName}
          role={result.role}
        />
      </div>
    </div>
  );
}

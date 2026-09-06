import { api, HydrateClient } from "@/trpc/server";
import { ReplyTriageList } from "@/components/replies/ReplyTriageList";
export const metadata = { title: "Reply triage" };
export const dynamic = "force-dynamic";
export default async function RepliesPage() {
  void api.replyTriage.list.prefetch({ category: undefined, includeDismissed: false });

  return (
    <HydrateClient>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reply triage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and classify incoming client replies.
          </p>
        </div>
        <ReplyTriageList />
      </div>
    </HydrateClient>
  );
}

import { ReplyTriageList } from "@/components/replies/ReplyTriageList";
export const metadata = { title: "Reply triage" };
export default function RepliesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reply triage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and classify incoming client replies.
        </p>
      </div>
      <ReplyTriageList />
    </div>
  );
}

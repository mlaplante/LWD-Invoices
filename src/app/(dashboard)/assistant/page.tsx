import { ChatAssistant } from "@/components/dashboard/ChatAssistant";

export const metadata = {
  title: "Ask your books",
};

export default function AssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ask your books</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A chat assistant over your live data — receivables, revenue, cash flow, client health,
          and collections. Read-only: it analyzes and recommends, but never changes anything.
        </p>
      </div>
      <ChatAssistant />
    </div>
  );
}

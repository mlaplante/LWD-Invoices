import { Suspense } from "react";

import { ChatAssistant } from "@/components/dashboard/ChatAssistant";
import { AiAgentCards } from "@/components/dashboard/AiAgentCards";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Ask your books",
};

/**
 * The AI hub. Ask Your Books is the front door — the agents sit beside it
 * as cards rather than as their own nav section, which is the point of
 * folding the old "Inbox & AI" group into one destination.
 */
export default function AssistantPage() {
  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="flex min-w-0 flex-[1.5] flex-col">
        <h1 className="font-display text-[28px]">Ask Your Books</h1>
        <p className="mb-5 mt-1 font-mono text-[11px] text-muted-foreground">
          read-only over your live data · grounded answers · never changes
          anything
        </p>
        <ChatAssistant />
      </div>

      <div className="flex-1 lg:pt-[64px]">
        <Suspense
          fallback={
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[104px] rounded-[10px]" />
              ))}
            </div>
          }
        >
          <AiAgentCards />
        </Suspense>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, useEffect } from "react";
import { Sparkles, Send } from "lucide-react";
import { useAssistantChat } from "./useAssistantChat";

const SUGGESTIONS = [
  "who owes me money?",
  "revenue last quarter?",
  "which invoices should I chase first?",
  "projected cash position?",
  "which clients are at risk of churning?",
  "how much unbilled time do I have?",
];

const TOOL_LABELS: Record<string, string> = {
  get_accounts_receivable: "accounts receivable",
  get_overdue_invoices: "overdue invoices",
  get_revenue_summary: "revenue summary",
  get_unbilled_time: "unbilled time",
  get_client_health: "client health",
  get_cash_flow_forecast: "cash-flow forecast",
  get_collections_recommendations: "collections",
};

/**
 * The grounding line. Tools the model actually consulted are surfaced
 * *above* the answer rather than tucked underneath it — the point is to
 * tell you what the answer is based on before you read it, which is what
 * makes a read-only assistant over live books trustworthy.
 */
function CheckedLine({ tools }: { tools: string[] }) {
  const labels = Array.from(new Set(tools)).map((t) => TOOL_LABELS[t] ?? t);
  if (labels.length === 0) return null;

  return (
    <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground">
      ✦ checked: {labels.join(" · ")}
    </p>
  );
}

export function ChatAssistant() {
  const { messages, busy, send, fallbackPending } = useAssistantChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[420px] flex-col overflow-hidden rounded-[10px] border border-border bg-card">
      <div
        ref={scrollRef}
        aria-live="polite"
        className="flex-1 space-y-4 overflow-y-auto px-6 py-5"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-11 items-center justify-center rounded-[10px] bg-accent">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Ask your books</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                Receivables, revenue, cash flow, client health, collections. Read
                live, never changed.
              </p>
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const showThinking =
            m.role === "assistant" && m.streaming && m.content === "";

          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[70%] whitespace-pre-wrap rounded-[10px] rounded-br-[2px] bg-accent px-4 py-2.5 text-[13px] text-foreground">
                  {m.content}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="max-w-[82%]">
              {m.tools && m.tools.length > 0 && <CheckedLine tools={m.tools} />}
              <div className="whitespace-pre-wrap rounded-[10px] rounded-bl-[2px] border border-divider bg-muted px-[18px] py-3.5 text-[13px] leading-[1.7]">
                {showThinking ? (
                  <span className="text-muted-foreground">
                    Looking through your books…
                  </span>
                ) : (
                  m.content
                )}
              </div>
            </div>
          );
        })}

        {busy && fallbackPending && (
          <div className="max-w-[82%]">
            <div className="rounded-[10px] rounded-bl-[2px] border border-divider bg-muted px-[18px] py-3.5 text-[13px] text-muted-foreground">
              Looking through your books…
            </div>
          </div>
        )}
      </div>

      {/* Suggested questions stay available between turns, not just on the
          empty state — follow-ups are where they're most useful. */}
      <div className="flex flex-wrap gap-2 px-6 pb-3">
        {SUGGESTIONS.slice(0, messages.length === 0 ? 6 : 3).map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={busy}
            className="rounded-full border border-primary/30 px-3.5 py-[5px] text-[11px] text-primary transition-colors duration-200 ease-[ease] hover:bg-primary/[0.06] disabled:opacity-40 dark:text-accent-foreground"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
          setInput("");
        }}
        className="mx-6 mb-5 flex items-center gap-3 rounded-lg border border-input px-4 py-3 transition-colors duration-200 ease-[ease] focus-within:border-primary"
      >
        <Sparkles className="size-4 shrink-0 text-primary" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your books…"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send message"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] bg-primary px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[2px] text-primary-foreground transition-opacity disabled:opacity-40"
        >
          Ask
          <Send className="size-3" />
        </button>
      </form>
    </div>
  );
}

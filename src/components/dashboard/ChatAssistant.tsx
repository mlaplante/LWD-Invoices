"use client";

import { useRef, useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Sparkles, Send, Wrench } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const SUGGESTIONS = [
  "Which clients owe me money?",
  "What was my revenue last quarter?",
  "Which invoices should I chase first?",
  "What's my projected cash position?",
  "Which clients are at risk of churning?",
  "How much unbilled time do I have?",
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

export function ChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, tools: res.toolCalls.map((t) => t.tool) },
      ]);
    },
    onError: (err) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry — ${err.message}` }]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || ask.isPending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    ask.mutate({
      messages: next.map((m) => ({ role: m.role, content: m.content })),
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Ask your books</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Ask about receivables, revenue, cash flow, client health, or collections. I read
                your data live and never change anything.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-accent/50 px-4 py-2.5 text-sm whitespace-pre-wrap"
              }
            >
              {m.content}
              {m.tools && m.tools.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Wrench className="w-3 h-3" />
                  {Array.from(new Set(m.tools))
                    .map((t) => TOOL_LABELS[t] ?? t)
                    .join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}

        {ask.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-accent/50 px-4 py-2.5 text-sm text-muted-foreground">
              Looking through your books…
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-border/50 p-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your books…"
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          disabled={ask.isPending}
        />
        <button
          type="submit"
          disabled={ask.isPending || !input.trim()}
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

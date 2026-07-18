"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, RotateCcw, Send, Sparkles } from "lucide-react";
import { trpc } from "@/trpc/client";
import { useAssistantChat } from "@/components/dashboard/useAssistantChat";

const SUGGESTIONS = [
  "Who paid late last quarter?",
  "Top expense categories this year",
  "How much did I bill last month vs collected?",
];

export function ReportsAskPanel() {
  const { data: aiCapabilities } = trpc.organization.aiCapabilities.useQuery();
  const { messages, busy, error, send } = useAssistantChat();
  const [input, setInput] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const expanded = messages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  if (aiCapabilities?.aiEnabled === false) return null;

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    setLastQuestion(trimmed);
    send(trimmed);
    setInput("");
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-primary/10 bg-primary/[0.035] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Ask about your numbers</h2>
            <p className="text-xs text-muted-foreground">Live answers grounded in your invoices, payments, and expenses.</p>
          </div>
        </div>
        {!expanded && <span className="text-xs font-medium text-primary">Report builder</span>}
      </div>

      {expanded && (
        <div ref={scrollRef} className="max-h-72 space-y-3 overflow-y-auto px-5 py-4">
          {messages.map((message, index) => (
            <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <p className={message.role === "user"
                ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap"
                : "max-w-[90%] rounded-2xl rounded-bl-sm bg-accent/60 px-3 py-2 text-sm whitespace-pre-wrap"}>
                {message.streaming && !message.content ? "Looking through your books…" : message.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm">
          <span><strong className="font-medium">Report builder unavailable.</strong> {error}</span>
          <button type="button" onClick={() => ask(lastQuestion)} disabled={!lastQuestion || busy} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary disabled:opacity-40">
            <RotateCcw className="size-3" /> Retry
          </button>
        </div>
      )}

      {!expanded && (
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => ask(suggestion)} disabled={busy} className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:opacity-40">
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(event) => { event.preventDefault(); ask(input); }} className="flex items-center gap-2 px-5 py-4">
        <MessageCircleQuestion className="size-4 shrink-0 text-muted-foreground" />
        <input value={input} onChange={(event) => setInput(event.target.value)} disabled={busy} placeholder="Ask a report question…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Ask report question" className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40">
          <Send className="size-3.5" />
        </button>
      </form>
    </section>
  );
}

"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";

const MAX_HISTORY = 20;

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  streaming?: boolean;
}

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; toolCalls?: { tool: string }[] }
  | { type: "error"; message: string };

/** Shared SSE-first assistant client, with the established tRPC fallback. */
export function useAssistantChat() {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, tools: res.toolCalls.map((tool) => tool.tool) },
      ]);
      setError(null);
      setBusy(false);
    },
    onError: (requestError) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry — ${requestError.message}` }]);
      setError(requestError.message);
      setBusy(false);
    },
  });

  function updateLastAssistant(fn: (message: AssistantChatMessage) => AssistantChatMessage) {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last?.role === "assistant") copy[copy.length - 1] = fn(last);
      return copy;
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const history = [...messages, { role: "user" as const, content: trimmed }].slice(-MAX_HISTORY);
    const payload = history.map((message) => ({ role: message.role, content: message.content }));
    setMessages([...history, { role: "assistant", content: "", tools: [], streaming: true }]);
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      if (!res.ok || !res.body) throw new Error("stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const line = buffer.slice(0, sep).trim();
          buffer = buffer.slice(sep + 2);
          if (!line.startsWith("data:")) continue;
          let event: StreamEvent;
          try {
            event = JSON.parse(line.slice(5).trim()) as StreamEvent;
          } catch {
            continue;
          }
          if (event.type === "delta") {
            updateLastAssistant((message) => ({ ...message, content: message.content + event.text }));
          } else if (event.type === "done") {
            const tools = (event.toolCalls ?? []).map((tool) => tool.tool);
            updateLastAssistant((message) => ({ ...message, tools, streaming: false }));
          } else if (event.type === "error") {
            updateLastAssistant((message) => ({
              ...message,
              content: message.content || event.message,
              streaming: false,
            }));
          }
        }
      }
      updateLastAssistant((message) => ({ ...message, streaming: false }));
      setBusy(false);
    } catch {
      // Streaming failed before producing output — drop the placeholder and
      // fall back to the non-streaming endpoint.
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant" && last.content === "") copy.pop();
        return copy;
      });
      ask.mutate({ messages: payload });
    }
  }

  return { messages, busy, error, send, fallbackPending: ask.isPending };
}

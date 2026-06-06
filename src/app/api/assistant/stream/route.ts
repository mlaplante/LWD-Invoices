import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import {
  streamBooksAssistant,
  type BooksAssistantMessage,
} from "@/server/services/books-assistant";

const MAX_HISTORY = 20;

/**
 * SSE streaming endpoint for the "Ask your books" assistant. Streams the
 * answer token-by-token (Gemini path) so the chat UI renders progressively.
 * Each event is a `data: {json}\n\n` line: {type:"delta",text} | {type:"done",
 * toolCalls} | {type:"error",message}. Kept as a plain route (not tRPC) so it
 * doesn't require changing the app's batch-link transport.
 */
export async function POST(req: Request) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const rawMessages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > MAX_HISTORY) {
    return new Response(JSON.stringify({ error: "messages must be a 1-20 item array" }), { status: 400 });
  }

  const messages: BooksAssistantMessage[] = [];
  for (const m of rawMessages) {
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || content.length === 0 || content.length > 4000) {
      return new Response(JSON.stringify({ error: "Invalid message shape" }), { status: 400 });
    }
    messages.push({ role, content });
  }

  if (messages[messages.length - 1].role !== "user") {
    return new Response(JSON.stringify({ error: "Last message must be from the user" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of streamBooksAssistant({ db, orgId }, messages)) {
          send(event);
        }
      } catch (err) {
        console.error("[assistant/stream]", err);
        send({ type: "error", message: "Sorry — something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

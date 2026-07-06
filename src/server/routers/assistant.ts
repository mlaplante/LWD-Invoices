import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createRateLimiter } from "@/lib/rate-limit";
import { runBooksAssistant, type BooksAssistantMessage } from "@/server/services/books-assistant";

const MAX_HISTORY = 20;

// LLM calls cost real money — cap per-org usage so a misbehaving client or
// compromised session can't run up the bill. Mirrors the streamLimiter on the
// SSE twin (src/app/api/assistant/stream/route.ts), which was previously the
// only rate-limited entry point into the assistant.
const askLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export const assistantRouter = router({
  /**
   * Ask the books assistant a question. The client sends the running
   * conversation (plain text turns); the server runs the Anthropic tool-use
   * loop over read-only, org-scoped data tools and returns the reply plus a
   * trace of which tools ran.
   */
  ask: protectedProcedure
    .input(
      z.object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(4000),
            }),
          )
          .min(1)
          .max(MAX_HISTORY),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (askLimiter.isLimited(ctx.orgId)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many assistant requests. Try again in a minute.",
        });
      }

      // The conversation must end on a user turn for the model to respond.
      const last = input.messages[input.messages.length - 1];
      if (last.role !== "user") {
        return { reply: "Ask me a question to get started.", toolCalls: [], unavailable: false };
      }
      const history: BooksAssistantMessage[] = input.messages;
      return runBooksAssistant({ db: ctx.db, orgId: ctx.orgId }, history);
    }),
});

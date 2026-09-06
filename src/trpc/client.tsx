"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink, splitLink } from "@trpc/client";
import { SHORT_CACHE_QUERIES } from "@/lib/short-cache-queries";
import superjson from "@/lib/superjson";
import { useState } from "react";
import { makeQueryClient } from "./query-client";

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.URL) return process.env.URL; // Netlify deploy URL
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

let browserQueryClient: ReturnType<typeof makeQueryClient> | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        // Two batch links, split by whether the query is on the short-cache
        // allowlist. The route handler's responseMeta only emits
        // "cache-control: private, max-age=30" when EVERY procedure in a batch
        // is allowlisted; a page's normal batch mixes reference data
        // (currencies.list, taxes.list, ...) with page-specific queries, so the
        // whole batch used to resolve to no-store and the header never
        // applied. Routing allowlisted queries through their own link keeps
        // their batches pure and lets the browser cache them.
        //
        // Queries already go out as GET: @trpc/client resolves the method as
        // `methodOverride ?? { query: "GET", mutation: "POST" }[op.type]`, and
        // `methodOverride` is typed 'POST'-only (a blanket override for hosts
        // that can't route non-POST), so nothing else is needed for caching.
        //
        // Streaming batch link, not plain httpBatchLink: a non-streaming batch
        // resolves as a single unit, so every procedure waits for the slowest
        // one before any of them paint. httpBatchStreamLink flushes each
        // response as it resolves. maxURLLength only guards a batch's GET URL
        // against intermediary length limits (it splits into more requests);
        // it does not fall back to POST.
        splitLink({
          condition: (op) => op.type === "query" && SHORT_CACHE_QUERIES.has(op.path),
          true: httpBatchStreamLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            maxURLLength: 2048,
          }),
          false: httpBatchStreamLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            maxURLLength: 2048,
          }),
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

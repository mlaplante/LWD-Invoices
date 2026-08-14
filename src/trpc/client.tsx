"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink } from "@trpc/client";
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
        // Streaming batch link, not plain httpBatchLink. Batching is still what
        // we want (one request instead of N), but a non-streaming batch resolves
        // as a single unit: every procedure in the batch waits for the slowest
        // one before any of them paint. Pages that fire a wide batch — the
        // money-intelligence dashboard sends seven, an invoice detail page sends
        // a long tail of panel queries — hold their fast panels hostage to the
        // slow one. httpBatchStreamLink flushes each response as it resolves.
        //
        // Options are a superset of httpBatchLink's (it adds `streamHeader`), so
        // url/transformer/maxURLLength carry over unchanged.
        httpBatchStreamLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          maxURLLength: 2048,
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

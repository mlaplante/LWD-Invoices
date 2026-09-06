import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import { SHORT_CACHE_QUERIES } from "@/lib/short-cache-queries";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    responseMeta({ type, paths, errors }) {
      if (type !== "query" || errors.length > 0) {
        return { headers: new Headers({ "cache-control": "no-store" }) };
      }
      const allShortCacheable = paths?.every((p) => SHORT_CACHE_QUERIES.has(p));
      if (allShortCacheable) {
        return {
          headers: new Headers({
            "cache-control": "private, max-age=30, stale-while-revalidate=60",
          }),
        };
      }
      return {
        headers: new Headers({ "cache-control": "private, no-store" }),
      };
    },
  });

export { handler as GET, handler as POST };

import "server-only";
import { cache } from "react";
import { createTRPCContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createHydrationHelpers } from "@trpc/react-query/rsc";
import { makeQueryClient } from "./query-client";

const createCaller = createCallerFactory(appRouter);

export const getQueryClient = cache(makeQueryClient);

const caller = createCaller(createTRPCContext);

export const { trpc: api, HydrateClient } = createHydrationHelpers<typeof appRouter>(
  caller,
  getQueryClient,
);

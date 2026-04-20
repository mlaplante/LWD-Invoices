import "server-only";
import { cache } from "react";
import { db } from "./db";

/**
 * Fetch the internal User row by Supabase UUID — deduplicated per request.
 * Both tRPC context and server-component layouts call into this; React
 * cache() collapses them into a single DB roundtrip per request.
 */
export const findDbUserBySupabaseId = cache(async (supabaseId: string) =>
  db.user.findFirst({
    where: { supabaseId },
    select: { id: true, isActive: true },
  })
);

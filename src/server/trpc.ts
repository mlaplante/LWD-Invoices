import { initTRPC, TRPCError } from "@trpc/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "./db";
import superjson from "superjson";
import { ZodError } from "zod";

export const createTRPCContext = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;
  const orgId = (user?.app_metadata?.organizationId as string) ?? null;

  return { db, userId, orgId };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const orgId = ctx.orgId;
  return next({ ctx: { ...ctx, userId: ctx.userId, orgId } });
});

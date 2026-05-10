import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getFxRate } from "../services/fx-rates";

export const fxRouter = router({
  /**
   * Look up the mid-market rate for `1 base = X target`. Used when the
   * invoice currency differs from the org's default and the user wants a
   * suggested exchange rate.
   *
   * Returns { rate: null } when the provider is unreachable or the
   * currency code is unknown — UI should leave the rate at 1 and prompt
   * the user to enter a manual override.
   */
  rate: protectedProcedure
    .input(z.object({ base: z.string().length(3), target: z.string().length(3) }))
    .query(async ({ input }) => {
      const rate = await getFxRate(input.base, input.target);
      return { rate, source: rate === null ? null : "frankfurter" as const };
    }),
});

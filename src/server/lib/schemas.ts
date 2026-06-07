import { z } from "zod";

/**
 * Shared Zod input schemas.
 *
 * These small shapes were previously re-declared inline in dozens of routers
 * (`z.object({ id: z.string() })` alone appeared ~80 times). Centralizing them
 * keeps validation consistent — e.g. the pagination clamp limits live in one
 * place — and makes router inputs read as intent rather than boilerplate.
 *
 * Extend per-procedure when extra fields are needed:
 *
 *   .input(idInput.extend({ archived: z.boolean().optional() }))
 *   .input(paginationInput.extend({ search: z.string().optional() }))
 */

/** A single opaque record id. */
export const idInput = z.object({ id: z.string() });

/**
 * Offset pagination input ({ page, pageSize }). Pair with
 * `paginationFromInput` from "@/lib/pagination" to derive Prisma skip/take.
 * Defaults and the 100-row ceiling are enforced here so every list endpoint
 * clamps identically.
 */
export const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

/**
 * Postal address fields shared by organizations, clients and contractor W-9s.
 * All optional/nullable so it can back both create (omit) and update (clear)
 * flows. Use `.partial()`/`.extend()` at the call site for stricter variants.
 */
export const addressSchema = z.object({
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
});

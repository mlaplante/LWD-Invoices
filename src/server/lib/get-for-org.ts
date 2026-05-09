import { TRPCError } from "@trpc/server";

/**
 * Fetch a row scoped to the caller's organization, or throw NOT_FOUND.
 *
 * Multi-tenancy in this codebase is enforced by writing
 * `where: { id, organizationId: ctx.orgId }` on every model lookup. Missing
 * the orgId clause once is enough to leak data across tenants. This helper
 * centralizes the pattern so each call site is one short, audit-friendly line.
 *
 *   const invoice = await getForOrg(ctx.db.invoice, input.id, ctx.orgId, {
 *     include: detailInvoiceInclude,
 *     entityName: "Invoice",
 *   });
 *
 * Pass `idField` when the unique key isn't `id` (e.g. portal tokens).
 */

type FindFirstArgs = {
  where: Record<string, unknown>;
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
};

type FindFirstDelegate<T> = {
  findFirst: (args: FindFirstArgs) => Promise<T | null>;
};

export async function getForOrg<T>(
  model: FindFirstDelegate<T>,
  id: string,
  organizationId: string,
  options: {
    include?: Record<string, unknown>;
    select?: Record<string, unknown>;
    idField?: string;
    entityName?: string;
  } = {},
): Promise<T> {
  const idField = options.idField ?? "id";
  const args: FindFirstArgs = {
    where: { [idField]: id, organizationId },
  };
  if (options.include) args.include = options.include;
  if (options.select) args.select = options.select;

  const row = await model.findFirst(args);
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${options.entityName ?? "Record"} not found`,
    });
  }
  return row;
}

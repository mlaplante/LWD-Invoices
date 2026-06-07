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

/**
 * Assert that a foreign id supplied by the caller (a `clientId`, `projectId`,
 * etc. in mutation input) belongs to the caller's organization, throwing
 * NOT_FOUND otherwise.
 *
 * Use this before trusting an id you didn't just fetch — writing
 * `{ clientId: input.clientId, organizationId: ctx.orgId }` on a new row only
 * scopes the *new* row; it never checks that the referenced client is in the
 * same tenant. Skipping this check lets a caller reference another org's
 * record by id (cross-tenant read/write). Fetches a single column to keep the
 * existence check cheap.
 */
export async function assertInOrg(
  model: FindFirstDelegate<{ id: string }>,
  id: string,
  organizationId: string,
  options: { idField?: string; entityName?: string } = {},
): Promise<void> {
  await getForOrg(model, id, organizationId, {
    select: { id: true },
    idField: options.idField,
    entityName: options.entityName,
  });
}

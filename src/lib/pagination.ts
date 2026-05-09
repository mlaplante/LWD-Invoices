import type { NextRequest } from "next/server";

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

export type Pagination = {
  page: number;
  perPage: number;
  skip: number;
  take: number;
};

/**
 * Normalize raw pagination inputs into safe positive integers and a
 * { skip, take } pair ready to drop into a Prisma query. Centralized so
 * the clamp limit and defaults stay consistent across REST + tRPC.
 */
export function clampPagination(
  rawPage: number | string | null | undefined,
  rawPerPage: number | string | null | undefined,
  opts: { defaultPerPage?: number; maxPerPage?: number } = {},
): Pagination {
  const defaultPerPage = opts.defaultPerPage ?? DEFAULT_PER_PAGE;
  const maxPerPage = opts.maxPerPage ?? MAX_PER_PAGE;

  const parsedPage =
    typeof rawPage === "number" ? rawPage : parseInt((rawPage ?? "") as string, 10);
  const parsedPerPage =
    typeof rawPerPage === "number" ? rawPerPage : parseInt((rawPerPage ?? "") as string, 10);

  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : DEFAULT_PAGE;
  const perPage =
    Number.isFinite(parsedPerPage) && parsedPerPage >= 1
      ? Math.min(Math.floor(parsedPerPage), maxPerPage)
      : defaultPerPage;

  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

/** Read `page` + `per_page` query params from a Next request. */
export function paginationFromRequest(req: NextRequest, opts?: Parameters<typeof clampPagination>[2]) {
  const url = new URL(req.url);
  return clampPagination(url.searchParams.get("page"), url.searchParams.get("per_page"), opts);
}

/** Convert a tRPC-style { page, pageSize } input into Prisma skip/take. */
export function paginationFromInput(
  input: { page: number; pageSize: number },
  opts?: Parameters<typeof clampPagination>[2],
) {
  return clampPagination(input.page, input.pageSize, opts);
}

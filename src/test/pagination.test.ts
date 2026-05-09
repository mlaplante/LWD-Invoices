import { describe, it, expect } from "vitest";
import { clampPagination, paginationFromInput } from "@/lib/pagination";

describe("clampPagination", () => {
  it("falls back to defaults on missing input", () => {
    expect(clampPagination(null, null)).toEqual({ page: 1, perPage: 20, skip: 0, take: 20 });
  });

  it("computes skip from page + perPage", () => {
    expect(clampPagination(3, 25)).toEqual({ page: 3, perPage: 25, skip: 50, take: 25 });
  });

  it("clamps perPage above the cap", () => {
    expect(clampPagination(1, 9999).perPage).toBe(100);
    expect(clampPagination(1, 9999).take).toBe(100);
  });

  it("rejects negative or zero values", () => {
    expect(clampPagination(-5, -10)).toEqual({ page: 1, perPage: 20, skip: 0, take: 20 });
    expect(clampPagination(0, 0)).toEqual({ page: 1, perPage: 20, skip: 0, take: 20 });
  });

  it("rejects NaN strings and non-numeric junk", () => {
    expect(clampPagination("foo", "bar")).toEqual({ page: 1, perPage: 20, skip: 0, take: 20 });
  });

  it("respects custom defaults and max", () => {
    expect(clampPagination(null, null, { defaultPerPage: 50, maxPerPage: 200 }))
      .toEqual({ page: 1, perPage: 50, skip: 0, take: 50 });
    expect(clampPagination(1, 500, { maxPerPage: 200 }).perPage).toBe(200);
  });
});

describe("paginationFromInput", () => {
  it("normalizes a tRPC-style { page, pageSize } object", () => {
    expect(paginationFromInput({ page: 2, pageSize: 10 })).toEqual({
      page: 2,
      perPage: 10,
      skip: 10,
      take: 10,
    });
  });
});

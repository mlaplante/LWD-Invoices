import { describe, it, expect } from "vitest";
import { paginationParams } from "@/app/api/v1/auth";

function makeReq(search = "") {
  return { url: `http://localhost/api/v1/invoices${search}` } as ReturnType<typeof paginationParams extends (req: infer R) => unknown ? () => R : never>;
}

describe("paginationParams", () => {
  it("uses defaults when no params provided", () => {
    const r = paginationParams({ url: "http://localhost/api" } as any);
    expect(r.page).toBe(1);
    expect(r.skip).toBe(0);
    expect(r.take).toBe(20);
  });

  it("computes skip correctly from page and per_page", () => {
    const r = paginationParams({ url: "http://localhost/api?page=3&per_page=10" } as any);
    expect(r.page).toBe(3);
    expect(r.skip).toBe(20);
    expect(r.take).toBe(10);
  });

  it("clamps per_page to a maximum of 100", () => {
    const r = paginationParams({ url: "http://localhost/api?per_page=999" } as any);
    expect(r.take).toBe(100);
  });

  it("treats page < 1 as page 1", () => {
    const r = paginationParams({ url: "http://localhost/api?page=0" } as any);
    expect(r.page).toBe(1);
    expect(r.skip).toBe(0);
  });

  it("treats negative page as page 1", () => {
    const r = paginationParams({ url: "http://localhost/api?page=-5" } as any);
    expect(r.page).toBe(1);
  });

  it("falls back to defaults for non-numeric params", () => {
    const r = paginationParams({ url: "http://localhost/api?page=abc&per_page=xyz" } as any);
    expect(r.page).toBe(1);
    expect(r.take).toBe(20);
  });
});

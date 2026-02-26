import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceStatus, InvoiceType, LineType } from "@/generated/prisma";

describe("Invoices Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  describe("create", () => {
    it("placeholder test", () => {
      expect(true).toBe(true);
    });
  });

  describe("update", () => {
    it("placeholder test", () => {
      expect(true).toBe(true);
    });
  });

  describe("delete", () => {
    it("placeholder test", () => {
      expect(true).toBe(true);
    });
  });
});

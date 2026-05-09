import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { getForOrg } from "@/server/lib/get-for-org";

type Args = { where: Record<string, unknown>; include?: unknown; select?: unknown };

function makeModel<T>(rows: Array<T & { id: string; organizationId: string }>) {
  const calls: Args[] = [];
  return {
    calls,
    findFirst: async (args: Args) => {
      calls.push(args);
      const w = args.where;
      const id = w.id as string | undefined;
      const orgId = w.organizationId as string | undefined;
      const portalToken = w.portalToken as string | undefined;
      return (
        rows.find((r) => {
          if (orgId && r.organizationId !== orgId) return false;
          if (id !== undefined && r.id !== id) return false;
          if (portalToken !== undefined && (r as Record<string, unknown>).portalToken !== portalToken) return false;
          return true;
        }) ?? null
      );
    },
  };
}

describe("getForOrg", () => {
  it("returns the row when id + organizationId match", async () => {
    const model = makeModel([{ id: "a", organizationId: "org1", name: "X" }]);
    const row = await getForOrg(model, "a", "org1");
    expect(row).toMatchObject({ id: "a", name: "X" });
    expect(model.calls[0].where).toEqual({ id: "a", organizationId: "org1" });
  });

  it("does not leak rows from another organization", async () => {
    const model = makeModel([{ id: "a", organizationId: "org1" }]);
    await expect(getForOrg(model, "a", "other-org", { entityName: "Invoice" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws TRPCError NOT_FOUND with the entity name", async () => {
    const model = makeModel<{ name: string }>([]);
    try {
      await getForOrg(model, "missing", "org1", { entityName: "Invoice" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("NOT_FOUND");
      expect((err as TRPCError).message).toBe("Invoice not found");
    }
  });

  it("supports a custom idField for token-based lookups", async () => {
    const model = makeModel([{ id: "internal-1", organizationId: "org1", portalToken: "tok-abc" }]);
    const row = await getForOrg(model, "tok-abc", "org1", { idField: "portalToken" });
    expect(row).toMatchObject({ id: "internal-1" });
    expect(model.calls[0].where).toEqual({ portalToken: "tok-abc", organizationId: "org1" });
  });

  it("forwards include and select options", async () => {
    const model = makeModel([{ id: "a", organizationId: "org1" }]);
    await getForOrg(model, "a", "org1", { include: { client: true } });
    expect(model.calls[0].include).toEqual({ client: true });
  });
});

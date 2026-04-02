import { describe, it, expect, beforeEach } from "vitest";
import { clientsRouter } from "@/server/routers/clients";
import { createMockContext } from "./mocks/trpc-context";

describe("Clients Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = clientsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns all clients for organization excluding archived", async () => {
      ctx.db.client.findMany.mockResolvedValue([
        {
          id: "c_1",
          name: "Active Client",
          email: "active@example.com",
          organizationId: "test-org-123",
          isArchived: false,
          phone: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          country: null,
          taxId: null,
          notes: null,
          portalPassphraseHash: null,
          defaultPaymentTermsDays: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await caller.list({ includeArchived: false });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Active Client");
      expect(ctx.db.client.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "test-org-123",
          isArchived: false,
        },
        orderBy: { name: "asc" },
      });
    });

    it("filters clients by search term", async () => {
      ctx.db.client.findMany.mockResolvedValue([
        {
          id: "c_1",
          name: "Acme Corp",
          email: "acme@example.com",
          organizationId: "test-org-123",
          isArchived: false,
          phone: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          country: null,
          taxId: null,
          notes: null,
          portalPassphraseHash: null,
          defaultPaymentTermsDays: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await caller.list({
        includeArchived: false,
        search: "acme",
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Acme Corp");
      expect(ctx.db.client.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "test-org-123",
          isArchived: false,
          OR: [
            { name: { contains: "acme", mode: "insensitive" } },
            { email: { contains: "acme", mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
      });
    });

    it("includes archived clients when requested", async () => {
      ctx.db.client.findMany.mockResolvedValue([
        {
          id: "c_1",
          name: "Active Client",
          email: "active@example.com",
          organizationId: "test-org-123",
          isArchived: false,
          phone: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          country: null,
          taxId: null,
          notes: null,
          portalPassphraseHash: null,
          defaultPaymentTermsDays: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "c_2",
          name: "Archived Client",
          email: "archived@example.com",
          organizationId: "test-org-123",
          isArchived: true,
          phone: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          country: null,
          taxId: null,
          notes: null,
          portalPassphraseHash: null,
          defaultPaymentTermsDays: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await caller.list({ includeArchived: true });

      expect(result).toHaveLength(2);
      expect(ctx.db.client.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "test-org-123",
        },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("get", () => {
    it("returns single client by id", async () => {
      const mockClient = {
        id: "c_1",
        name: "Test Client",
        email: "test@example.com",
        organizationId: "test-org-123",
        isArchived: false,
        phone: "123-456-7890",
        address: "123 Main St",
        city: "Springfield",
        state: "IL",
        zip: "62701",
        country: "USA",
        taxId: "12-3456789",
        notes: "Important client",
        portalPassphraseHash: null,
        defaultPaymentTermsDays: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.client.findUnique.mockResolvedValue(mockClient);

      const result = await caller.get({ id: "c_1" });

      expect(result.id).toBe("c_1");
      expect(result.name).toBe("Test Client");
      expect(result.phone).toBe("123-456-7890");
      expect(ctx.db.client.findUnique).toHaveBeenCalledWith({
        where: { id: "c_1", organizationId: "test-org-123" },
      });
    });

    it("throws NOT_FOUND when client doesn't exist", async () => {
      ctx.db.client.findUnique.mockResolvedValue(null);

      try {
        await caller.get({ id: "c_nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("create", () => {
    it("creates client with required fields only", async () => {
      ctx.db.client.create.mockResolvedValue({
        id: "c_new",
        name: "New Client",
        email: null,
        organizationId: "test-org-123",
        isArchived: false,
        phone: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        country: null,
        taxId: null,
        notes: null,
        portalPassphraseHash: null,
        defaultPaymentTermsDays: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.create({ name: "New Client" });

      expect(result.id).toBe("c_new");
      expect(result.name).toBe("New Client");
      expect(ctx.db.client.create).toHaveBeenCalledWith({
        data: {
          name: "New Client",
          organizationId: "test-org-123",
        },
      });
    });

    it("creates client with all optional contact fields", async () => {
      ctx.db.client.create.mockResolvedValue({
        id: "c_full",
        name: "Full Client",
        email: "full@example.com",
        organizationId: "test-org-123",
        isArchived: false,
        phone: "555-1234",
        address: "456 Oak Ave",
        city: "Chicago",
        state: "IL",
        zip: "60601",
        country: "USA",
        taxId: "98-7654321",
        notes: "VIP client",
        portalPassphraseHash: null,
        defaultPaymentTermsDays: 45,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.create({
        name: "Full Client",
        email: "full@example.com",
        phone: "555-1234",
        address: "456 Oak Ave",
        city: "Chicago",
        state: "IL",
        zip: "60601",
        country: "USA",
        taxId: "98-7654321",
        notes: "VIP client",
        defaultPaymentTermsDays: 45,
      });

      expect(result.email).toBe("full@example.com");
      expect(result.phone).toBe("555-1234");
      expect(result.city).toBe("Chicago");
      expect(result.defaultPaymentTermsDays).toBe(45);
    });

    it("hashes portal passphrase on create", async () => {
      ctx.db.client.create.mockResolvedValue({
        id: "c_pass",
        name: "Secure Client",
        email: null,
        organizationId: "test-org-123",
        isArchived: false,
        phone: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        country: null,
        taxId: null,
        notes: null,
        portalPassphraseHash: "$2a$12$hashed_passphrase_value",
        defaultPaymentTermsDays: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.create({
        name: "Secure Client",
        portalPassphrase: "secret123",
      });

      expect(result.portalPassphraseHash).toBe(
        "$2a$12$hashed_passphrase_value"
      );
      // Verify that hash was called (passphrase was processed)
      expect(ctx.db.client.create).toHaveBeenCalled();
      const callData = ctx.db.client.create.mock.calls[0][0];
      expect(callData.data.portalPassphraseHash).toBeDefined();
    });
  });

  describe("update", () => {
    it("updates client with all fields", async () => {
      ctx.db.client.update.mockResolvedValue({
        id: "c_1",
        name: "Updated Client",
        email: "updated@example.com",
        organizationId: "test-org-123",
        isArchived: false,
        phone: "999-9999",
        address: "999 New St",
        city: "Updated City",
        state: "CA",
        zip: "90210",
        country: "USA",
        taxId: "11-1111111",
        notes: "Updated notes",
        portalPassphraseHash: null,
        defaultPaymentTermsDays: 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        id: "c_1",
        name: "Updated Client",
        email: "updated@example.com",
        phone: "999-9999",
        address: "999 New St",
        city: "Updated City",
        state: "CA",
        zip: "90210",
        country: "USA",
        taxId: "11-1111111",
        notes: "Updated notes",
        defaultPaymentTermsDays: 60,
      });

      expect(result.name).toBe("Updated Client");
      expect(result.city).toBe("Updated City");
      expect(result.defaultPaymentTermsDays).toBe(60);
      expect(ctx.db.client.update).toHaveBeenCalledWith({
        where: { id: "c_1", organizationId: "test-org-123" },
        data: expect.objectContaining({
          name: "Updated Client",
          email: "updated@example.com",
        }),
      });
    });

    it("updates client with partial fields", async () => {
      ctx.db.client.update.mockResolvedValue({
        id: "c_1",
        name: "Partial Update",
        email: "original@example.com",
        organizationId: "test-org-123",
        isArchived: false,
        phone: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        country: null,
        taxId: null,
        notes: null,
        portalPassphraseHash: null,
        defaultPaymentTermsDays: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        id: "c_1",
        name: "Partial Update",
      });

      expect(result.name).toBe("Partial Update");
      expect(ctx.db.client.update).toHaveBeenCalledWith({
        where: { id: "c_1", organizationId: "test-org-123" },
        data: {
          name: "Partial Update",
        },
      });
    });
  });
});

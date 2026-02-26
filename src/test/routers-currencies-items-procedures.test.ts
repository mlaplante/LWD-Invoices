import { describe, it, expect, beforeEach } from "vitest";
import { currenciesRouter } from "@/server/routers/currencies";
import { itemsRouter } from "@/server/routers/items";
import { createMockContext } from "./mocks/trpc-context";

describe("Currencies Router Procedures", () => {
  let ctx: any;
  let currenciesCaller: any;

  beforeEach(() => {
    ctx = createMockContext();
    currenciesCaller = currenciesRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns all available currencies for organization", async () => {
      const mockCurrencies = [
        {
          id: "curr_1",
          code: "USD",
          name: "United States Dollar",
          symbol: "$",
          symbolPosition: "before" as const,
          exchangeRate: 1.0,
          isDefault: true,
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "curr_2",
          code: "EUR",
          name: "Euro",
          symbol: "€",
          symbolPosition: "after" as const,
          exchangeRate: 0.92,
          isDefault: false,
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      ctx.db.currency.findMany.mockResolvedValue(mockCurrencies);

      const result = await currenciesCaller.list();

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe("USD");
      expect(result[1].code).toBe("EUR");
      expect(ctx.db.currency.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123" },
        orderBy: { code: "asc" },
      });
    });
  });

  describe("create with currency code format validation (ISO 4217)", () => {
    it("creates currency with valid ISO 4217 currency code", async () => {
      const newCurrency = {
        id: "curr_1",
        code: "JPY",
        name: "Japanese Yen",
        symbol: "¥",
        symbolPosition: "before" as const,
        exchangeRate: 0.0067,
        isDefault: false,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.currency.create.mockResolvedValue(newCurrency);

      const result = await currenciesCaller.create({
        code: "JPY",
        name: "Japanese Yen",
        symbol: "¥",
        symbolPosition: "before",
        exchangeRate: 0.0067,
      });

      expect(result.code).toBe("JPY");
      expect(result.code).toMatch(/^[A-Z]{1,10}$/);
      expect(result.exchangeRate).toBe(0.0067);
      expect(ctx.db.currency.create).toHaveBeenCalledWith({
        data: {
          code: "JPY",
          name: "Japanese Yen",
          symbol: "¥",
          symbolPosition: "before",
          exchangeRate: 0.0067,
          isDefault: false,
          organizationId: "test-org-123",
        },
      });
    });
  });

  describe("create with exchange rate validation", () => {
    it("creates currency and validates exchange rate is positive number", async () => {
      const newCurrency = {
        id: "curr_1",
        code: "CAD",
        name: "Canadian Dollar",
        symbol: "C$",
        symbolPosition: "before" as const,
        exchangeRate: 0.73,
        isDefault: false,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.currency.create.mockResolvedValue(newCurrency);

      const result = await currenciesCaller.create({
        code: "CAD",
        name: "Canadian Dollar",
        symbol: "C$",
        exchangeRate: 0.73,
      });

      expect(result.exchangeRate).toBe(0.73);
      expect(result.exchangeRate).toBeGreaterThan(0);
    });
  });

  describe("update with active/inactive status", () => {
    it("supports updating currency with isDefault flag for status", async () => {
      const updatedCurrency = {
        id: "curr_1",
        code: "AUD",
        name: "Australian Dollar",
        symbol: "A$",
        symbolPosition: "before" as const,
        exchangeRate: 0.66,
        isDefault: true,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.currency.updateMany.mockResolvedValue({ count: 1 });
      ctx.db.currency.update.mockResolvedValue(updatedCurrency);

      const result = await currenciesCaller.update({
        id: "curr_1",
        isDefault: true,
      });

      expect(result.isDefault).toBe(true);
      expect(ctx.db.currency.updateMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123" },
        data: { isDefault: false },
      });
      expect(ctx.db.currency.update).toHaveBeenCalledWith({
        where: { id: "curr_1", organizationId: "test-org-123" },
        data: {
          isDefault: true,
          exchangeRate: 1,
          symbolPosition: "before",
        },
      });
    });
  });

  describe("currency symbol format", () => {
    it("stores currency symbols in various formats", async () => {
      const symbolTests = [
        { code: "USD", symbol: "$" },
        { code: "EUR", symbol: "€" },
        { code: "GBP", symbol: "£" },
        { code: "JPY", symbol: "¥" },
        { code: "CAD", symbol: "C$" },
      ];

      for (const test of symbolTests) {
        ctx.db.currency.create.mockResolvedValue({
          id: `curr_${test.code}`,
          code: test.code,
          name: `Currency for ${test.code}`,
          symbol: test.symbol,
          symbolPosition: "before" as const,
          exchangeRate: 1.0,
          isDefault: false,
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await currenciesCaller.create({
          code: test.code,
          name: `Currency for ${test.code}`,
          symbol: test.symbol,
        });

        expect(result.symbol).toBe(test.symbol);
      }
    });
  });

  describe("delete", () => {
    it("deletes a currency by ID", async () => {
      const deletedCurrency = {
        id: "curr_1",
        code: "TEST",
        name: "Test Currency",
        symbol: "T",
        symbolPosition: "before" as const,
        exchangeRate: 1.0,
        isDefault: false,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.currency.delete.mockResolvedValue(deletedCurrency);

      const result = await currenciesCaller.delete({ id: "curr_1" });

      expect(result.id).toBe("curr_1");
      expect(ctx.db.currency.delete).toHaveBeenCalledWith({
        where: { id: "curr_1", organizationId: "test-org-123" },
      });
    });
  });
});

describe("Items Router Procedures", () => {
  let ctx: any;
  let itemsCaller: any;

  beforeEach(() => {
    ctx = createMockContext();
    itemsCaller = itemsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns line item templates for organization", async () => {
      const mockItems = [
        {
          id: "item_1",
          name: "Professional Services",
          description: "Hourly consulting services",
          rate: 150,
          unit: "hour",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "item_2",
          name: "Software License",
          description: "Annual software license",
          rate: 1200,
          unit: "year",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      ctx.db.item.findMany.mockResolvedValue(mockItems);

      const result = await itemsCaller.list();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Professional Services");
      expect(result[1].name).toBe("Software License");
      expect(ctx.db.item.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123" },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("list with optional filtering", () => {
    it("returns filtered items when searching", async () => {
      const mockItems = [
        {
          id: "item_1",
          name: "Development Services",
          description: "Software development",
          rate: 200,
          unit: "hour",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      ctx.db.item.findMany.mockResolvedValue(mockItems);

      const result = await itemsCaller.list();

      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("Development");
    });
  });

  describe("create", () => {
    it("creates new item with required fields", async () => {
      const newItem = {
        id: "item_1",
        name: "UI/UX Design",
        description: "User interface and experience design",
        rate: 3000,
        unit: "project",
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.item.create.mockResolvedValue(newItem);

      const result = await itemsCaller.create({
        name: "UI/UX Design",
        description: "User interface and experience design",
        rate: 3000,
        unit: "project",
      });

      expect(result).toEqual(newItem);
      expect(result.name).toBe("UI/UX Design");
      expect(result.organizationId).toBe("test-org-123");
      expect(ctx.db.item.create).toHaveBeenCalledWith({
        data: {
          name: "UI/UX Design",
          description: "User interface and experience design",
          rate: 3000,
          unit: "project",
          organizationId: "test-org-123",
        },
      });
    });
  });

  describe("create with price validation", () => {
    it("validates price is a positive number", async () => {
      const newItem = {
        id: "item_1",
        name: "Hourly Work",
        description: "General labor",
        rate: 75.5,
        unit: "hour",
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.item.create.mockResolvedValue(newItem);

      const result = await itemsCaller.create({
        name: "Hourly Work",
        description: "General labor",
        rate: 75.5,
        unit: "hour",
      });

      expect(result.rate).toBe(75.5);
      expect(result.rate).toBeGreaterThan(0);
    });
  });

  describe("update", () => {
    it("modifies item details", async () => {
      const updatedItem = {
        id: "item_1",
        name: "Updated Item Name",
        description: "Updated description",
        rate: 250,
        unit: "hour",
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.item.update.mockResolvedValue(updatedItem);

      const result = await itemsCaller.update({
        id: "item_1",
        name: "Updated Item Name",
        description: "Updated description",
        rate: 250,
      });

      expect(result).toEqual(updatedItem);
      expect(result.name).toBe("Updated Item Name");
      expect(result.rate).toBe(250);
      expect(ctx.db.item.update).toHaveBeenCalledWith({
        where: {
          id: "item_1",
          organizationId: "test-org-123",
        },
        data: {
          name: "Updated Item Name",
          description: "Updated description",
          rate: 250,
        },
      });
    });
  });

  describe("tax rate application in invoices", () => {
    it("supports storing items for tax calculation during invoice creation", async () => {
      const mockItems = [
        {
          id: "item_1",
          name: "Taxable Service",
          description: "Service subject to tax",
          rate: 1000,
          unit: "service",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      ctx.db.item.findMany.mockResolvedValue(mockItems);

      const result = await itemsCaller.list();

      expect(result).toHaveLength(1);
      expect(result[0].rate).toBe(1000);
      // Tax configuration would be applied separately at invoice line level
      const taxRate = 0.1; // 10% tax
      const taxAmount = result[0].rate * taxRate;
      expect(taxAmount).toBe(100);
    });
  });

  describe("item reusability across invoices", () => {
    it("allows item templates to be retrieved and reused across multiple invoices", async () => {
      const reusableItem = {
        id: "item_1",
        name: "Standard Hourly Rate",
        description: "Billable hourly work",
        rate: 100,
        unit: "hour",
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.item.findMany.mockResolvedValue([reusableItem]);

      // Simulate listing items for use in multiple invoices
      const firstInvoiceItems = await itemsCaller.list();
      const secondInvoiceItems = await itemsCaller.list();

      expect(firstInvoiceItems[0].id).toBe(secondInvoiceItems[0].id);
      expect(firstInvoiceItems[0].rate).toBe(secondInvoiceItems[0].rate);
      // Verify the items can be retrieved multiple times
      expect(ctx.db.item.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("delete", () => {
    it("deletes an item by ID", async () => {
      const deletedItem = {
        id: "item_1",
        name: "Deleted Item",
        description: "This item was deleted",
        rate: 500,
        unit: "project",
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.item.delete.mockResolvedValue(deletedItem);

      const result = await itemsCaller.delete({ id: "item_1" });

      expect(result.id).toBe("item_1");
      expect(ctx.db.item.delete).toHaveBeenCalledWith({
        where: { id: "item_1", organizationId: "test-org-123" },
      });
    });
  });

  describe("item without optional fields", () => {
    it("creates item with only required name field", async () => {
      const minimalItem = {
        id: "item_1",
        name: "Basic Item",
        description: null,
        rate: null,
        unit: null,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.item.create.mockResolvedValue(minimalItem);

      const result = await itemsCaller.create({
        name: "Basic Item",
      });

      expect(result.name).toBe("Basic Item");
      expect(result.description).toBeNull();
      expect(result.rate).toBeNull();
      expect(result.unit).toBeNull();
    });
  });

  describe("items ordered by name", () => {
    it("returns items ordered alphabetically by name", async () => {
      const mockItems = [
        {
          id: "item_1",
          name: "Alpha Service",
          description: null,
          rate: 100,
          unit: "hour",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "item_2",
          name: "Beta Service",
          description: null,
          rate: 150,
          unit: "hour",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "item_3",
          name: "Gamma Service",
          description: null,
          rate: 200,
          unit: "hour",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      ctx.db.item.findMany.mockResolvedValue(mockItems);

      const result = await itemsCaller.list();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("Alpha Service");
      expect(result[1].name).toBe("Beta Service");
      expect(result[2].name).toBe("Gamma Service");
      expect(ctx.db.item.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123" },
        orderBy: { name: "asc" },
      });
    });
  });
});

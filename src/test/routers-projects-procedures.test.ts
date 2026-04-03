import { describe, it, expect, beforeEach, vi } from "vitest";
import { projectsRouter } from "@/server/routers/projects";
import { createMockContext } from "./mocks/trpc-context";
import { ProjectStatus } from "@/generated/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

describe("Projects Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = projectsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns active projects for organization", async () => {
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: "p_1",
          name: "Active Project",
          description: "A test project",
          status: ProjectStatus.ACTIVE,
          clientId: "c_1",
          organizationId: "test-org-123",
          currencyId: "usd",
          dueDate: null,
          rate: 0,
          projectedHours: 0,
          isFlatRate: false,
          isViewable: false,
          isTimesheetViewable: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          client: { id: "c_1", name: "Test Client" },
          currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
          _count: { tasks: 5, timeEntries: 10, expenses: 2 },
        },
      ]);

      ctx.db.project.count.mockResolvedValue(1);

      const result = await caller.list({ includeArchived: false });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Active Project");
      expect(result.items[0].status).toBe(ProjectStatus.ACTIVE);
    });

    it("filters projects by status", async () => {
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: "p_1",
          name: "On Hold Project",
          description: null,
          status: ProjectStatus.ON_HOLD,
          clientId: "c_1",
          organizationId: "test-org-123",
          currencyId: "usd",
          dueDate: null,
          rate: 0,
          projectedHours: 0,
          isFlatRate: false,
          isViewable: false,
          isTimesheetViewable: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          client: { id: "c_1", name: "Test Client" },
          currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
          _count: { tasks: 2, timeEntries: 0, expenses: 0 },
        },
      ]);

      ctx.db.project.count.mockResolvedValue(1);

      const result = await caller.list({
        status: ProjectStatus.ON_HOLD,
        includeArchived: false,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe(ProjectStatus.ON_HOLD);
      expect(ctx.db.project.findMany).toHaveBeenCalled();
    });

    it("filters projects by client", async () => {
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: "p_1",
          name: "Client A Project",
          description: null,
          status: ProjectStatus.ACTIVE,
          clientId: "c_1",
          organizationId: "test-org-123",
          currencyId: "usd",
          dueDate: null,
          rate: 0,
          projectedHours: 0,
          isFlatRate: false,
          isViewable: false,
          isTimesheetViewable: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          client: { id: "c_1", name: "Client A" },
          currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
          _count: { tasks: 3, timeEntries: 5, expenses: 1 },
        },
      ]);

      ctx.db.project.count.mockResolvedValue(1);

      const result = await caller.list({
        clientId: "c_1",
        includeArchived: false,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].client.id).toBe("c_1");
    });
  });

  describe("get", () => {
    it("returns project with full relations", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        name: "Full Project",
        description: "Complete project data",
        status: ProjectStatus.ACTIVE,
        clientId: "c_1",
        organizationId: "test-org-123",
        currencyId: "usd",
        dueDate: new Date("2026-12-31"),
        rate: 150,
        projectedHours: 100,
        isFlatRate: true,
        isViewable: true,
        isTimesheetViewable: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        client: { id: "c_1", name: "Test Client" },
        currency: {
          id: "usd",
          symbol: "$",
          symbolPosition: "LEFT",
          code: "USD",
        },
        milestones: [],
        tasks: [],
        _count: { tasks: 10, timeEntries: 50, expenses: 5 },
      });

      ctx.db.timeEntry.aggregate.mockResolvedValue({
        _sum: { minutes: new Decimal("3000") },
      });

      ctx.db.expense.aggregate = vi.fn().mockResolvedValue({
        _sum: { rate: new Decimal("5000") },
      });

      const result = await caller.get({ id: "p_1" });

      expect(result.id).toBe("p_1");
      expect(result.name).toBe("Full Project");
      expect(result.summary.totalMinutes).toBe(3000);
      expect(result.summary.totalExpenses).toBe(5000);
      expect(result._count.tasks).toBe(10);
    });

    it("throws NOT_FOUND when project doesn't exist", async () => {
      ctx.db.project.findUnique.mockResolvedValue(null);

      try {
        await caller.get({ id: "p_nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("create", () => {
    it("creates project with required fields", async () => {
      ctx.db.$transaction.mockImplementation(async (fn) => {
        return await fn(ctx.db);
      });

      ctx.db.project.create.mockResolvedValue({
        id: "p_new",
        name: "New Project",
        description: null,
        status: ProjectStatus.ACTIVE,
        clientId: "c_1",
        organizationId: "test-org-123",
        currencyId: "usd",
        dueDate: null,
        rate: 0,
        projectedHours: 0,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        client: { id: "c_1", name: "Test Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT", code: "USD" },
        milestones: [],
        tasks: [],
        _count: { tasks: 0, timeEntries: 0, expenses: 0 },
      });

      const result = await caller.create({
        name: "New Project",
        clientId: "c_1",
        currencyId: "usd",
      });

      expect(result.id).toBe("p_new");
      expect(result.name).toBe("New Project");
      expect(result.status).toBe(ProjectStatus.ACTIVE);
      expect(ctx.db.project.create).toHaveBeenCalled();
    });

    it("creates project with optional fields", async () => {
      ctx.db.$transaction.mockImplementation(async (fn) => {
        return await fn(ctx.db);
      });

      ctx.db.project.create.mockResolvedValue({
        id: "p_optional",
        name: "Optional Fields Project",
        description: "A detailed description",
        status: ProjectStatus.ACTIVE,
        clientId: "c_1",
        organizationId: "test-org-123",
        currencyId: "eur",
        dueDate: new Date("2026-06-30"),
        rate: 200,
        projectedHours: 200,
        isFlatRate: true,
        isViewable: true,
        isTimesheetViewable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        client: { id: "c_1", name: "Test Client" },
        currency: { id: "eur", symbol: "€", symbolPosition: "RIGHT", code: "EUR" },
        milestones: [],
        tasks: [],
        _count: { tasks: 0, timeEntries: 0, expenses: 0 },
      });

      const result = await caller.create({
        name: "Optional Fields Project",
        clientId: "c_1",
        currencyId: "eur",
        description: "A detailed description",
        dueDate: new Date("2026-06-30"),
        rate: 200,
        projectedHours: 200,
        isFlatRate: true,
        isViewable: true,
      });

      expect(result.description).toBe("A detailed description");
      expect(result.rate).toBe(200);
      expect(result.isFlatRate).toBe(true);
    });

    it("creates project with template", async () => {
      ctx.db.$transaction.mockImplementation(async (fn) => {
        return await fn(ctx.db);
      });

      ctx.db.project.create.mockResolvedValue({
        id: "p_template",
        name: "Template Project",
        description: null,
        status: ProjectStatus.ACTIVE,
        clientId: "c_1",
        organizationId: "test-org-123",
        currencyId: "usd",
        dueDate: null,
        rate: 0,
        projectedHours: 0,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        client: { id: "c_1", name: "Test Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT", code: "USD" },
        milestones: [],
        tasks: [],
        _count: { tasks: 0, timeEntries: 0, expenses: 0 },
      });

      ctx.db.projectTemplate.findUnique.mockResolvedValue({
        id: "t_1",
        organizationId: "test-org-123",
        name: "Standard Template",
        tasks: [],
      });

      const result = await caller.create({
        name: "Template Project",
        clientId: "c_1",
        currencyId: "usd",
        templateId: "t_1",
      });

      expect(result.id).toBe("p_template");
      expect(ctx.db.projectTemplate.findUnique).toHaveBeenCalled();
    });

    it("creates project with default status ACTIVE", async () => {
      ctx.db.$transaction.mockImplementation(async (fn) => {
        return await fn(ctx.db);
      });

      ctx.db.project.create.mockResolvedValue({
        id: "p_default",
        name: "Default Status Project",
        description: null,
        status: ProjectStatus.ACTIVE,
        clientId: "c_1",
        organizationId: "test-org-123",
        currencyId: "usd",
        dueDate: null,
        rate: 0,
        projectedHours: 0,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        client: { id: "c_1", name: "Test Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT", code: "USD" },
        milestones: [],
        tasks: [],
        _count: { tasks: 0, timeEntries: 0, expenses: 0 },
      });

      const result = await caller.create({
        name: "Default Status Project",
        clientId: "c_1",
        currencyId: "usd",
      });

      expect(result.status).toBe(ProjectStatus.ACTIVE);
    });
  });

  describe("update", () => {
    it("updates project with all fields", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        name: "Original Project",
        status: ProjectStatus.ACTIVE,
        organizationId: "test-org-123",
      });

      ctx.db.project.update.mockResolvedValue({
        id: "p_1",
        name: "Updated Project",
        description: "Updated description",
        status: ProjectStatus.ON_HOLD,
        clientId: "c_2",
        organizationId: "test-org-123",
        currencyId: "eur",
        dueDate: new Date("2026-12-31"),
        rate: 250,
        projectedHours: 150,
        isFlatRate: true,
        isViewable: true,
        isTimesheetViewable: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        id: "p_1",
        name: "Updated Project",
        description: "Updated description",
        status: ProjectStatus.ON_HOLD,
        clientId: "c_2",
        currencyId: "eur",
        dueDate: new Date("2026-12-31"),
        rate: 250,
        projectedHours: 150,
        isFlatRate: true,
        isViewable: true,
        isTimesheetViewable: true,
      });

      expect(result.name).toBe("Updated Project");
      expect(result.status).toBe(ProjectStatus.ON_HOLD);
      expect(ctx.db.project.update).toHaveBeenCalled();
    });

    it("updates project with partial fields", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        organizationId: "test-org-123",
      });

      ctx.db.project.update.mockResolvedValue({
        id: "p_1",
        name: "Partially Updated",
        description: null,
        status: ProjectStatus.ACTIVE,
        clientId: "c_1",
        organizationId: "test-org-123",
        currencyId: "usd",
        dueDate: null,
        rate: 0,
        projectedHours: 0,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        id: "p_1",
        name: "Partially Updated",
      });

      expect(result.name).toBe("Partially Updated");
      expect(ctx.db.project.update).toHaveBeenCalled();
      const callArgs = ctx.db.project.update.mock.calls[0][0];
      expect(callArgs.where.id).toBe("p_1");
      expect(callArgs.data.name).toBe("Partially Updated");
    });

    it("throws NOT_FOUND when project doesn't exist", async () => {
      ctx.db.project.findUnique.mockResolvedValue(null);

      try {
        await caller.update({
          id: "p_nonexistent",
          name: "Updated Name",
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });
});

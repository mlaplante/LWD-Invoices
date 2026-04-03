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

  describe("list – additional cases", () => {
    it("paginates results correctly", async () => {
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: "p_3",
          name: "Page 2 Project",
          status: ProjectStatus.ACTIVE,
          organizationId: "test-org-123",
          client: { id: "c_1", name: "Client" },
          currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
          _count: { tasks: 0, timeEntries: 0, expenses: 0 },
        },
      ]);
      ctx.db.project.count.mockResolvedValue(3);

      const result = await caller.list({ page: 2, pageSize: 1, includeArchived: false });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(3);
      const callArgs = ctx.db.project.findMany.mock.calls[0][0];
      expect(callArgs.skip).toBe(1);
      expect(callArgs.take).toBe(1);
    });

    it("includes archived projects when includeArchived is true", async () => {
      ctx.db.project.findMany.mockResolvedValue([]);
      ctx.db.project.count.mockResolvedValue(0);

      await caller.list({ includeArchived: true });

      const callArgs = ctx.db.project.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty("status");
    });

    it("excludes archived projects by default", async () => {
      ctx.db.project.findMany.mockResolvedValue([]);
      ctx.db.project.count.mockResolvedValue(0);

      await caller.list({ includeArchived: false });

      const callArgs = ctx.db.project.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toEqual({ not: ProjectStatus.ARCHIVED });
    });

    it("status filter takes precedence over includeArchived exclusion", async () => {
      ctx.db.project.findMany.mockResolvedValue([]);
      ctx.db.project.count.mockResolvedValue(0);

      await caller.list({ status: ProjectStatus.ARCHIVED, includeArchived: false });

      const callArgs = ctx.db.project.findMany.mock.calls[0][0];
      // Both filters are spread into the where clause
      expect(callArgs.where.organizationId).toBe("test-org-123");
    });
  });

  describe("get – additional cases", () => {
    it("handles null aggregate sums gracefully", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_empty",
        name: "Empty Project",
        status: ProjectStatus.ACTIVE,
        organizationId: "test-org-123",
        client: { id: "c_1", name: "Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT", code: "USD" },
        milestones: [],
        tasks: [],
        _count: { tasks: 0, timeEntries: 0, expenses: 0 },
      });

      ctx.db.timeEntry.aggregate.mockResolvedValue({
        _sum: { minutes: null },
      });
      ctx.db.expense.aggregate = vi.fn().mockResolvedValue({
        _sum: { rate: null },
      });

      const result = await caller.get({ id: "p_empty" });

      expect(result.summary.totalMinutes).toBe(0);
      expect(result.summary.totalExpenses).toBe(0);
    });
  });

  describe("create – template with tasks", () => {
    it("creates tasks from template with parent-child relationships", async () => {
      ctx.db.$transaction.mockImplementation(async (fn) => {
        return await fn(ctx.db);
      });

      ctx.db.project.create.mockResolvedValue({
        id: "p_tmpl",
        name: "Template Project",
        status: ProjectStatus.ACTIVE,
        organizationId: "test-org-123",
        client: { id: "c_1", name: "Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT", code: "USD" },
        milestones: [],
        tasks: [],
        _count: { tasks: 0, timeEntries: 0, expenses: 0 },
      });

      ctx.db.projectTemplate.findUnique.mockResolvedValue({
        id: "t_1",
        organizationId: "test-org-123",
        name: "Dev Template",
        tasks: [
          { name: "Parent Task", notes: "Notes", sortOrder: 0, projectedHours: 10, rate: 100, parentSortOrder: null },
          { name: "Child Task", notes: null, sortOrder: 1, projectedHours: 5, rate: 50, parentSortOrder: 0 },
        ],
      });

      let createCallCount = 0;
      ctx.db.projectTask.create.mockImplementation(async () => {
        createCallCount++;
        return { id: `task_${createCallCount}`, name: createCallCount === 1 ? "Parent Task" : "Child Task" };
      });

      await caller.create({
        name: "Template Project",
        clientId: "c_1",
        currencyId: "usd",
        templateId: "t_1",
      });

      expect(ctx.db.projectTask.create).toHaveBeenCalledTimes(2);

      // First call: parent task (no parentId)
      const firstCall = ctx.db.projectTask.create.mock.calls[0][0];
      expect(firstCall.data.name).toBe("Parent Task");
      expect(firstCall.data.parentId).toBeNull();

      // Second call: child task (parentId = task_1)
      const secondCall = ctx.db.projectTask.create.mock.calls[1][0];
      expect(secondCall.data.name).toBe("Child Task");
      expect(secondCall.data.parentId).toBe("task_1");
    });

    it("skips task creation when template not found", async () => {
      ctx.db.$transaction.mockImplementation(async (fn) => {
        return await fn(ctx.db);
      });

      ctx.db.project.create.mockResolvedValue({
        id: "p_no_tmpl",
        name: "No Template",
        status: ProjectStatus.ACTIVE,
        organizationId: "test-org-123",
        client: { id: "c_1", name: "Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT", code: "USD" },
        milestones: [],
        tasks: [],
        _count: { tasks: 0, timeEntries: 0, expenses: 0 },
      });

      ctx.db.projectTemplate.findUnique.mockResolvedValue(null);

      await caller.create({
        name: "No Template",
        clientId: "c_1",
        currencyId: "usd",
        templateId: "t_missing",
      });

      expect(ctx.db.projectTask.create).not.toHaveBeenCalled();
    });
  });

  describe("archive", () => {
    it("archives an existing project", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        status: ProjectStatus.ACTIVE,
        organizationId: "test-org-123",
      });
      ctx.db.project.update.mockResolvedValue({
        id: "p_1",
        status: ProjectStatus.ARCHIVED,
        organizationId: "test-org-123",
      });

      const result = await caller.archive({ id: "p_1", status: ProjectStatus.ARCHIVED });

      expect(result.status).toBe(ProjectStatus.ARCHIVED);
      expect(ctx.db.project.update).toHaveBeenCalledWith({
        where: { id: "p_1", organizationId: "test-org-123" },
        data: { status: ProjectStatus.ARCHIVED },
      });
    });

    it("unarchives a project back to ACTIVE", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        status: ProjectStatus.ARCHIVED,
        organizationId: "test-org-123",
      });
      ctx.db.project.update.mockResolvedValue({
        id: "p_1",
        status: ProjectStatus.ACTIVE,
        organizationId: "test-org-123",
      });

      const result = await caller.archive({ id: "p_1", status: ProjectStatus.ACTIVE });

      expect(result.status).toBe(ProjectStatus.ACTIVE);
    });

    it("throws NOT_FOUND when project does not exist", async () => {
      ctx.db.project.findUnique.mockResolvedValue(null);

      try {
        await caller.archive({ id: "p_nonexistent", status: ProjectStatus.ARCHIVED });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("can set status to COMPLETED", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        status: ProjectStatus.ACTIVE,
        organizationId: "test-org-123",
      });
      ctx.db.project.update.mockResolvedValue({
        id: "p_1",
        status: ProjectStatus.COMPLETED,
        organizationId: "test-org-123",
      });

      const result = await caller.archive({ id: "p_1", status: ProjectStatus.COMPLETED });

      expect(result.status).toBe(ProjectStatus.COMPLETED);
    });
  });

  describe("delete", () => {
    it("deletes a project with no billed time entries", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        organizationId: "test-org-123",
      });
      ctx.db.timeEntry.count.mockResolvedValue(0);
      ctx.db.project.delete.mockResolvedValue({
        id: "p_1",
        name: "Deleted Project",
        organizationId: "test-org-123",
      });

      const result = await caller.delete({ id: "p_1" });

      expect(result.id).toBe("p_1");
      expect(ctx.db.project.delete).toHaveBeenCalledWith({
        where: { id: "p_1", organizationId: "test-org-123" },
      });
    });

    it("throws NOT_FOUND when project does not exist", async () => {
      ctx.db.project.findUnique.mockResolvedValue(null);

      try {
        await caller.delete({ id: "p_nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("throws BAD_REQUEST when project has billed time entries", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        organizationId: "test-org-123",
      });
      ctx.db.timeEntry.count.mockResolvedValue(3);

      try {
        await caller.delete({ id: "p_1" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("billed time entries");
      }
    });

    it("does not delete when billed entries exist", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        organizationId: "test-org-123",
      });
      ctx.db.timeEntry.count.mockResolvedValue(1);

      try {
        await caller.delete({ id: "p_1" });
      } catch {
        // expected
      }

      expect(ctx.db.project.delete).not.toHaveBeenCalled();
    });

    it("checks billed entries scoped to org and project", async () => {
      ctx.db.project.findUnique.mockResolvedValue({
        id: "p_1",
        organizationId: "test-org-123",
      });
      ctx.db.timeEntry.count.mockResolvedValue(0);
      ctx.db.project.delete.mockResolvedValue({ id: "p_1" });

      await caller.delete({ id: "p_1" });

      expect(ctx.db.timeEntry.count).toHaveBeenCalledWith({
        where: {
          projectId: "p_1",
          organizationId: "test-org-123",
          invoiceLineId: { not: null },
        },
      });
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { tasksRouter } from "@/server/routers/tasks";
import { createMockContext } from "./mocks/trpc-context";
import { Decimal } from "@prisma/client-runtime-utils";

describe("Tasks Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = tasksRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns tasks for project with relations", async () => {
      const mockTasks = [
        {
          id: "task_1",
          projectId: "proj_123",
          organizationId: "test-org-123",
          name: "Task 1",
          notes: "Notes for task 1",
          sortOrder: 0,
          projectedHours: new Decimal("8"),
          rate: new Decimal("100"),
          dueDate: new Date("2026-03-01"),
          parentId: null,
          milestoneId: "milestone_1",
          taskStatusId: "status_1",
          assignedUserId: null,
          isFlatRate: false,
          isViewable: true,
          isTimesheetViewable: true,
          isCompleted: false,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          taskStatus: {
            id: "status_1",
            name: "In Progress",
            organizationId: "test-org-123",
            color: "#0000FF",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          milestone: {
            id: "milestone_1",
            projectId: "proj_123",
            name: "Milestone 1",
            organizationId: "test-org-123",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          timer: null,
          _count: { timeEntries: 5, children: 0 },
        },
      ];

      ctx.db.projectTask.findMany.mockResolvedValue(mockTasks);

      const result = await caller.list({
        projectId: "proj_123",
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("task_1");
      expect(result[0].taskStatus).toBeDefined();
      expect(result[0].milestone).toBeDefined();
      expect(result[0]._count).toBeDefined();
      expect(ctx.db.projectTask.findMany).toHaveBeenCalledWith({
        where: {
          projectId: "proj_123",
          organizationId: "test-org-123",
        },
        include: {
          taskStatus: true,
          milestone: true,
          timer: true,
          _count: { select: { timeEntries: true, children: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("filters tasks by milestone when provided", async () => {
      const mockTasks = [
        {
          id: "task_2",
          projectId: "proj_123",
          organizationId: "test-org-123",
          name: "Task 2",
          notes: null,
          sortOrder: 1,
          projectedHours: new Decimal("4"),
          rate: new Decimal("50"),
          dueDate: null,
          parentId: null,
          milestoneId: "milestone_2",
          taskStatusId: null,
          assignedUserId: null,
          isFlatRate: false,
          isViewable: false,
          isTimesheetViewable: false,
          isCompleted: false,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          taskStatus: null,
          milestone: {
            id: "milestone_2",
            projectId: "proj_123",
            name: "Milestone 2",
            organizationId: "test-org-123",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          timer: null,
          _count: { timeEntries: 0, children: 2 },
        },
      ];

      ctx.db.projectTask.findMany.mockResolvedValue(mockTasks);

      const result = await caller.list({
        projectId: "proj_123",
        milestoneId: "milestone_2",
      });

      expect(result).toHaveLength(1);
      expect(result[0].milestoneId).toBe("milestone_2");
      expect(ctx.db.projectTask.findMany).toHaveBeenCalledWith({
        where: {
          projectId: "proj_123",
          organizationId: "test-org-123",
          milestoneId: "milestone_2",
        },
        include: {
          taskStatus: true,
          milestone: true,
          timer: true,
          _count: { select: { timeEntries: true, children: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("respects includeCompleted flag", async () => {
      const mockTasks = [];

      ctx.db.projectTask.findMany.mockResolvedValue(mockTasks);

      const result = await caller.list({
        projectId: "proj_123",
        includeCompleted: false,
      });

      expect(result).toHaveLength(0);
      expect(ctx.db.projectTask.findMany).toHaveBeenCalledWith({
        where: {
          projectId: "proj_123",
          organizationId: "test-org-123",
          isCompleted: false,
        },
        include: {
          taskStatus: true,
          milestone: true,
          timer: true,
          _count: { select: { timeEntries: true, children: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    });
  });

  describe("create", () => {
    it("creates task with required fields", async () => {
      const mockTask = {
        id: "task_new_1",
        projectId: "proj_123",
        organizationId: "test-org-123",
        name: "New Task",
        notes: null,
        sortOrder: 0,
        projectedHours: new Decimal("0"),
        rate: new Decimal("0"),
        dueDate: null,
        parentId: null,
        milestoneId: null,
        taskStatusId: null,
        assignedUserId: null,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        isCompleted: false,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        taskStatus: null,
        milestone: null,
      };

      ctx.db.projectTask.create.mockResolvedValue(mockTask);

      const result = await caller.create({
        projectId: "proj_123",
        name: "New Task",
      });

      expect(result.id).toBe("task_new_1");
      expect(result.name).toBe("New Task");
      expect(result.organizationId).toBe("test-org-123");
      expect(ctx.db.projectTask.create).toHaveBeenCalledWith({
        data: {
          projectId: "proj_123",
          name: "New Task",
          sortOrder: 0,
          projectedHours: 0,
          rate: 0,
          isFlatRate: false,
          isViewable: false,
          isTimesheetViewable: false,
          organizationId: "test-org-123",
        },
        include: { taskStatus: true, milestone: true },
      });
    });

    it("creates task with optional fields", async () => {
      const dueDate = new Date("2026-03-15");
      const mockTask = {
        id: "task_new_2",
        projectId: "proj_123",
        organizationId: "test-org-123",
        name: "Task with Options",
        notes: "Some notes",
        sortOrder: 5,
        projectedHours: new Decimal("16"),
        rate: new Decimal("150"),
        dueDate,
        parentId: "task_1",
        milestoneId: "milestone_1",
        taskStatusId: "status_1",
        assignedUserId: "user_1",
        isFlatRate: true,
        isViewable: true,
        isTimesheetViewable: true,
        isCompleted: false,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        taskStatus: {
          id: "status_1",
          name: "In Progress",
          organizationId: "test-org-123",
          color: "#0000FF",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        milestone: {
          id: "milestone_1",
          projectId: "proj_123",
          name: "Milestone 1",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      ctx.db.projectTask.create.mockResolvedValue(mockTask);

      const result = await caller.create({
        projectId: "proj_123",
        name: "Task with Options",
        notes: "Some notes",
        sortOrder: 5,
        projectedHours: 16,
        rate: 150,
        dueDate,
        parentId: "task_1",
        milestoneId: "milestone_1",
        taskStatusId: "status_1",
        assignedUserId: "user_1",
        isFlatRate: true,
        isViewable: true,
        isTimesheetViewable: true,
      });

      expect(result.id).toBe("task_new_2");
      expect(result.notes).toBe("Some notes");
      expect(result.dueDate).toEqual(dueDate);
      expect(result.parentId).toBe("task_1");
      expect(result.isFlatRate).toBe(true);
      expect(ctx.db.projectTask.create).toHaveBeenCalledWith({
        data: {
          projectId: "proj_123",
          name: "Task with Options",
          notes: "Some notes",
          sortOrder: 5,
          projectedHours: 16,
          rate: 150,
          dueDate,
          parentId: "task_1",
          milestoneId: "milestone_1",
          taskStatusId: "status_1",
          assignedUserId: "user_1",
          isFlatRate: true,
          isViewable: true,
          isTimesheetViewable: true,
          organizationId: "test-org-123",
        },
        include: { taskStatus: true, milestone: true },
      });
    });
  });

  describe("update", () => {
    it("updates task fields successfully", async () => {
      const existingTask = {
        id: "task_1",
        projectId: "proj_123",
        organizationId: "test-org-123",
        name: "Original Name",
        notes: null,
        sortOrder: 0,
        projectedHours: new Decimal("8"),
        rate: new Decimal("100"),
        dueDate: null,
        parentId: null,
        milestoneId: null,
        taskStatusId: null,
        assignedUserId: null,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        isCompleted: false,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedTask = {
        ...existingTask,
        name: "Updated Name",
        notes: "Updated notes",
        sortOrder: 2,
      };

      ctx.db.projectTask.findUnique.mockResolvedValue(existingTask);
      ctx.db.projectTask.update.mockResolvedValue({
        ...updatedTask,
        taskStatus: null,
        milestone: null,
      });

      const result = await caller.update({
        id: "task_1",
        name: "Updated Name",
        notes: "Updated notes",
        sortOrder: 2,
      });

      expect(result.name).toBe("Updated Name");
      expect(result.notes).toBe("Updated notes");
      expect(result.sortOrder).toBe(2);
      expect(ctx.db.projectTask.findUnique).toHaveBeenCalledWith({
        where: { id: "task_1", organizationId: "test-org-123" },
      });
      expect(ctx.db.projectTask.update).toHaveBeenCalledWith({
        where: { id: "task_1", organizationId: "test-org-123" },
        data: {
          name: "Updated Name",
          notes: "Updated notes",
          sortOrder: 2,
        },
        include: { taskStatus: true, milestone: true },
      });
    });

    it("throws NOT_FOUND when task doesn't exist", async () => {
      ctx.db.projectTask.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({
          id: "nonexistent_task",
          name: "Updated Name",
        })
      ).rejects.toThrow("NOT_FOUND");

      expect(ctx.db.projectTask.findUnique).toHaveBeenCalledWith({
        where: { id: "nonexistent_task", organizationId: "test-org-123" },
      });
    });

    it("allows partial updates", async () => {
      const existingTask = {
        id: "task_1",
        projectId: "proj_123",
        organizationId: "test-org-123",
        name: "Original Name",
        notes: "Original notes",
        sortOrder: 0,
        projectedHours: new Decimal("8"),
        rate: new Decimal("100"),
        dueDate: null,
        parentId: null,
        milestoneId: null,
        taskStatusId: null,
        assignedUserId: null,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        isCompleted: false,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedTask = {
        ...existingTask,
        dueDate: new Date("2026-03-20"),
      };

      ctx.db.projectTask.findUnique.mockResolvedValue(existingTask);
      ctx.db.projectTask.update.mockResolvedValue({
        ...updatedTask,
        taskStatus: null,
        milestone: null,
      });

      const result = await caller.update({
        id: "task_1",
        dueDate: new Date("2026-03-20"),
      });

      expect(result.dueDate).toEqual(new Date("2026-03-20"));
      expect(ctx.db.projectTask.update).toHaveBeenCalledWith({
        where: { id: "task_1", organizationId: "test-org-123" },
        data: {
          dueDate: new Date("2026-03-20"),
        },
        include: { taskStatus: true, milestone: true },
      });
    });
  });

  describe("complete", () => {
    it("marks task as completed", async () => {
      const existingTask = {
        id: "task_1",
        projectId: "proj_123",
        organizationId: "test-org-123",
        name: "Task to Complete",
        notes: null,
        sortOrder: 0,
        projectedHours: new Decimal("8"),
        rate: new Decimal("100"),
        dueDate: null,
        parentId: null,
        milestoneId: null,
        taskStatusId: null,
        assignedUserId: null,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        isCompleted: false,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedTask = {
        ...existingTask,
        isCompleted: true,
      };

      ctx.db.projectTask.findUnique.mockResolvedValue(existingTask);
      ctx.db.projectTask.update.mockResolvedValue(completedTask);

      const result = await caller.complete({
        id: "task_1",
        isCompleted: true,
      });

      expect(result.isCompleted).toBe(true);
      expect(ctx.db.projectTask.findUnique).toHaveBeenCalledWith({
        where: { id: "task_1", organizationId: "test-org-123" },
      });
      expect(ctx.db.projectTask.update).toHaveBeenCalledWith({
        where: { id: "task_1", organizationId: "test-org-123" },
        data: { isCompleted: true },
      });
    });

    it("marks task as incomplete", async () => {
      const existingTask = {
        id: "task_1",
        projectId: "proj_123",
        organizationId: "test-org-123",
        name: "Completed Task",
        notes: null,
        sortOrder: 0,
        projectedHours: new Decimal("8"),
        rate: new Decimal("100"),
        dueDate: null,
        parentId: null,
        milestoneId: null,
        taskStatusId: null,
        assignedUserId: null,
        isFlatRate: false,
        isViewable: false,
        isTimesheetViewable: false,
        isCompleted: true,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const incompletedTask = {
        ...existingTask,
        isCompleted: false,
      };

      ctx.db.projectTask.findUnique.mockResolvedValue(existingTask);
      ctx.db.projectTask.update.mockResolvedValue(incompletedTask);

      const result = await caller.complete({
        id: "task_1",
        isCompleted: false,
      });

      expect(result.isCompleted).toBe(false);
      expect(ctx.db.projectTask.update).toHaveBeenCalledWith({
        where: { id: "task_1", organizationId: "test-org-123" },
        data: { isCompleted: false },
      });
    });

    it("throws NOT_FOUND when task doesn't exist", async () => {
      ctx.db.projectTask.findUnique.mockResolvedValue(null);

      await expect(
        caller.complete({
          id: "nonexistent_task",
          isCompleted: true,
        })
      ).rejects.toThrow("NOT_FOUND");

      expect(ctx.db.projectTask.findUnique).toHaveBeenCalledWith({
        where: { id: "nonexistent_task", organizationId: "test-org-123" },
      });
    });
  });
});

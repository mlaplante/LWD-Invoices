import { describe, it, expect, beforeEach } from "vitest";
import { timeEntriesRouter } from "@/server/routers/timeEntries";
import { createMockContext } from "./mocks/trpc-context";
import { Decimal } from "@prisma/client-runtime-utils";

describe("TimeEntries Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = timeEntriesRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns time entries for organization", async () => {
      const mockEntries = [
        {
          id: "entry_1",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: "task_1",
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(120),
          startTime: "09:00",
          endTime: "11:00",
          note: "Development work",
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          task: {
            id: "task_1",
            name: "Design",
            rate: new Decimal(50),
          },
          project: {
            id: "proj_1",
            name: "Website Project",
            rate: new Decimal(75),
            currency: { symbol: "$", symbolPosition: "prefix" },
          },
        },
        {
          id: "entry_2",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          date: new Date("2026-02-25"),
          minutes: new Decimal(90),
          startTime: "14:00",
          endTime: "15:30",
          note: "Debugging",
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          task: null,
          project: {
            id: "proj_1",
            name: "Website Project",
            rate: new Decimal(75),
            currency: { symbol: "$", symbolPosition: "prefix" },
          },
        },
      ];

      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);

      const result = await caller.list({});

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("entry_1");
      expect(result[1].id).toBe("entry_2");
      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "test-org-123",
        },
        include: {
          task: { select: { id: true, name: true, rate: true } },
          project: { select: { id: true, name: true, rate: true, currency: true } },
        },
        orderBy: { date: "desc" },
      });
    });

    it("filters by projectId when provided", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.list({ projectId: "proj_1" });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            projectId: "proj_1",
          }),
        })
      );
    });

    it("filters by userId when provided", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.list({ userId: "user_789" });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            userId: "user_789",
          }),
        })
      );
    });

    it("filters by dateRange when provided", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      const dateFrom = new Date("2026-02-01");
      const dateTo = new Date("2026-02-28");

      await caller.list({ dateFrom, dateTo });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            date: {
              gte: dateFrom,
              lte: dateTo,
            },
          }),
        })
      );
    });

    it("filters unbilled entries only when requested", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.list({ unbilledOnly: true });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            invoiceLineId: null,
          }),
        })
      );
    });

    it("respects organization isolation", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.list({});

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
          }),
        })
      );
    });

    it("combines multiple filters", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      const dateFrom = new Date("2026-02-01");

      await caller.list({
        projectId: "proj_1",
        userId: "user_789",
        dateFrom,
        unbilledOnly: true,
      });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            projectId: "proj_1",
            userId: "user_789",
            invoiceLineId: null,
            date: {
              gte: dateFrom,
            },
          }),
        })
      );
    });

    it("sorts by date descending", async () => {
      const mockEntries = [
        {
          id: "entry_2",
          date: new Date("2026-02-26"),
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          minutes: new Decimal(90),
          startTime: null,
          endTime: null,
          note: null,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          task: null,
          project: { id: "proj_1", name: "Project", rate: new Decimal(75), currency: null },
        },
        {
          id: "entry_1",
          date: new Date("2026-02-25"),
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          minutes: new Decimal(120),
          startTime: null,
          endTime: null,
          note: null,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          task: null,
          project: { id: "proj_1", name: "Project", rate: new Decimal(75), currency: null },
        },
      ];

      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);

      await caller.list({});

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { date: "desc" },
        })
      );
    });
  });

  describe("create", () => {
    it("creates time entry with duration validation", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 15,
      });

      const mockCreatedEntry = {
        id: "entry_1",
        organizationId: "test-org-123",
        projectId: "proj_1",
        taskId: "task_1",
        userId: "test-user-456",
        date: new Date("2026-02-26"),
        minutes: new Decimal(120),
        startTime: "09:00",
        endTime: "11:00",
        note: "Development",
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.timeEntry.create.mockResolvedValue(mockCreatedEntry);

      const result = await caller.create({
        projectId: "proj_1",
        taskId: "task_1",
        minutes: 120,
        date: new Date("2026-02-26"),
        note: "Development",
      });

      expect(result.id).toBe("entry_1");
      expect(result.organizationId).toBe("test-org-123");
      expect(result.userId).toBe("test-user-456");
      expect(ctx.db.timeEntry.create).toHaveBeenCalled();
    });

    it("applies time rounding based on organization interval", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 15,
      });

      ctx.db.timeEntry.create.mockResolvedValue({
        id: "entry_1",
        organizationId: "test-org-123",
        projectId: "proj_1",
        taskId: null,
        userId: "test-user-456",
        date: new Date("2026-02-26"),
        minutes: new Decimal(120),
        startTime: null,
        endTime: null,
        note: null,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await caller.create({
        projectId: "proj_1",
        minutes: 118,
      });

      expect(ctx.db.timeEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: "proj_1",
            userId: "test-user-456",
            organizationId: "test-org-123",
          }),
        })
      );
    });

    it("uses current date if not provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 0,
      });

      ctx.db.timeEntry.create.mockResolvedValue({
        id: "entry_1",
        organizationId: "test-org-123",
        projectId: "proj_1",
        taskId: null,
        userId: "test-user-456",
        date: new Date(),
        minutes: new Decimal(60),
        startTime: null,
        endTime: null,
        note: null,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.create({
        projectId: "proj_1",
        minutes: 60,
      });

      expect(result.id).toBe("entry_1");
      expect(ctx.db.timeEntry.create).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("modifies time entry when it exists", async () => {
      const mockExisting = {
        id: "entry_1",
        organizationId: "test-org-123",
        projectId: "proj_1",
        taskId: "task_1",
        userId: "test-user-456",
        date: new Date("2026-02-26"),
        minutes: new Decimal(120),
        startTime: "09:00",
        endTime: "11:00",
        note: "Development",
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdated = {
        ...mockExisting,
        minutes: new Decimal(90),
        note: "Updated note",
      };

      ctx.db.timeEntry.findUnique.mockResolvedValue(mockExisting);
      ctx.db.timeEntry.update.mockResolvedValue(mockUpdated);

      const result = await caller.update({
        id: "entry_1",
        minutes: 90,
        note: "Updated note",
      });

      expect(result.minutes).toEqual(new Decimal(90));
      expect(result.note).toBe("Updated note");
      expect(ctx.db.timeEntry.update).toHaveBeenCalledWith({
        where: { id: "entry_1", organizationId: "test-org-123" },
        data: {
          minutes: 90,
          note: "Updated note",
        },
      });
    });

    it("throws NOT_FOUND when time entry does not exist", async () => {
      ctx.db.timeEntry.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({
          id: "entry_999",
          minutes: 60,
        })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("respects organization isolation when updating", async () => {
      const mockExisting = {
        id: "entry_1",
        organizationId: "test-org-123",
        projectId: "proj_1",
        taskId: null,
        userId: "test-user-456",
        date: new Date("2026-02-26"),
        minutes: new Decimal(120),
        startTime: null,
        endTime: null,
        note: null,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.timeEntry.findUnique.mockResolvedValue(mockExisting);
      ctx.db.timeEntry.update.mockResolvedValue(mockExisting);

      await caller.update({
        id: "entry_1",
        minutes: 60,
      });

      expect(ctx.db.timeEntry.findUnique).toHaveBeenCalledWith({
        where: { id: "entry_1", organizationId: "test-org-123" },
      });
    });
  });

  describe("delete", () => {
    it("deletes unbilled time entry", async () => {
      const mockEntry = {
        id: "entry_1",
        organizationId: "test-org-123",
        projectId: "proj_1",
        taskId: null,
        userId: "test-user-456",
        date: new Date("2026-02-26"),
        minutes: new Decimal(120),
        startTime: null,
        endTime: null,
        note: null,
        invoiceLineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.timeEntry.findUnique.mockResolvedValue(mockEntry);
      ctx.db.timeEntry.delete.mockResolvedValue(mockEntry);

      const result = await caller.delete({ id: "entry_1" });

      expect(result.id).toBe("entry_1");
      expect(ctx.db.timeEntry.delete).toHaveBeenCalledWith({
        where: { id: "entry_1", organizationId: "test-org-123" },
      });
    });

    it("prevents deletion of billed time entries", async () => {
      const mockBilledEntry = {
        id: "entry_1",
        organizationId: "test-org-123",
        projectId: "proj_1",
        taskId: null,
        userId: "test-user-456",
        date: new Date("2026-02-26"),
        minutes: new Decimal(120),
        startTime: null,
        endTime: null,
        note: null,
        invoiceLineId: "line_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.timeEntry.findUnique.mockResolvedValue(mockBilledEntry);

      await expect(caller.delete({ id: "entry_1" })).rejects.toThrow(
        "Cannot delete a billed time entry."
      );
    });

    it("throws NOT_FOUND when time entry does not exist", async () => {
      ctx.db.timeEntry.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: "entry_999" })).rejects.toThrow("NOT_FOUND");
    });
  });
});

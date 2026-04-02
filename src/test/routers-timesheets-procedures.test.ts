import { describe, it, expect, beforeEach } from "vitest";
import { timesheetsRouter } from "@/server/routers/timesheets";
import { createMockContext } from "./mocks/trpc-context";
import { Decimal } from "@prisma/client-runtime-utils";

describe("Timesheets Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = timesheetsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns timesheets for organization with rounded minutes", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 15,
      });

      const mockEntries = [
        {
          id: "entry_1",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: "task_1",
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(118),
          startTime: "09:00",
          endTime: "10:58",
          note: "Development",
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          task: {
            id: "task_1",
            name: "Design",
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
      expect(result[0].rawMinutes).toBe(118);
      expect(result[0].roundedMinutes).toBeDefined();
      expect(result[1].rawMinutes).toBe(90);
    });

    it("filters by userId when provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 0,
      });

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

    it("filters by projectId and dateRange when provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 0,
      });

      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      const dateFrom = new Date("2026-02-01");
      const dateTo = new Date("2026-02-28");

      await caller.list({
        projectId: "proj_1",
        dateFrom,
        dateTo,
      });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            projectId: "proj_1",
            date: {
              gte: dateFrom,
              lte: dateTo,
            },
          }),
        })
      );
    });

    it("respects organization isolation", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 0,
      });

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

    it("uses default interval of 0 when organization taskTimeInterval is null", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: null,
      });

      const mockEntries = [
        {
          id: "entry_1",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(60),
          startTime: null,
          endTime: null,
          note: null,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          task: null,
          project: {
            id: "proj_1",
            name: "Project",
            rate: new Decimal(75),
            currency: { symbol: "$", symbolPosition: "prefix" },
          },
        },
      ];

      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);

      const result = await caller.list({});

      expect(result).toHaveLength(1);
      expect(result[0].rawMinutes).toBe(60);
      expect(result[0].roundedMinutes).toBeDefined();
    });
  });

  describe("summary", () => {
    it("aggregates hours by project with billable amount calculation", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 15,
      });

      const mockEntries = [
        {
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
          project: {
            id: "proj_1",
            name: "Website Project",
            rate: new Decimal(100),
            currency: { symbol: "$", symbolPosition: "prefix" },
          },
        },
        {
          id: "entry_2",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-789",
          date: new Date("2026-02-25"),
          minutes: new Decimal(180),
          startTime: null,
          endTime: null,
          note: null,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          project: {
            id: "proj_1",
            name: "Website Project",
            rate: new Decimal(100),
            currency: { symbol: "$", symbolPosition: "prefix" },
          },
        },
      ];

      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);

      const result = await caller.summary({ groupBy: "project" });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("proj_1");
      expect(result[0].label).toBe("Website Project");
      expect(result[0].totalMinutes).toBe(300); // 120 + 180
      expect(result[0].billableAmount).toBeGreaterThan(0); // (300/60) * 100 = 500
    });

    it("aggregates hours by user with billable amount calculation", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 0,
      });

      const mockEntries = [
        {
          id: "entry_1",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "user_1",
          date: new Date("2026-02-26"),
          minutes: new Decimal(120),
          startTime: null,
          endTime: null,
          note: null,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
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
          userId: "user_1",
          date: new Date("2026-02-25"),
          minutes: new Decimal(60),
          startTime: null,
          endTime: null,
          note: null,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          project: {
            id: "proj_1",
            name: "Website Project",
            rate: new Decimal(75),
            currency: { symbol: "$", symbolPosition: "prefix" },
          },
        },
      ];

      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);

      const result = await caller.summary({ groupBy: "user" });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("user_1");
      expect(result[0].totalMinutes).toBe(180); // 120 + 60
      expect(result[0].billableAmount).toBe(225); // (180/60) * 75 = 225
    });

    it("filters summary by projectId when provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 0,
      });

      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.summary({
        groupBy: "project",
        projectId: "proj_1",
      });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            projectId: "proj_1",
          }),
        })
      );
    });

    it("filters summary by userId when provided", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 0,
      });

      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.summary({
        groupBy: "project",
        userId: "user_789",
      });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            userId: "user_789",
          }),
        })
      );
    });

    it("applies hour aggregation logic with time interval rounding", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        taskTimeInterval: 30, // 30-minute interval
      });

      const mockEntries = [
        {
          id: "entry_1",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(45), // Should round to 30
          startTime: null,
          endTime: null,
          note: null,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          project: {
            id: "proj_1",
            name: "Website Project",
            rate: new Decimal(120),
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
          minutes: new Decimal(75), // Should round to 60
          startTime: null,
          endTime: null,
          note: null,
          invoiceLineId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          project: {
            id: "proj_1",
            name: "Website Project",
            rate: new Decimal(120),
            currency: { symbol: "$", symbolPosition: "prefix" },
          },
        },
      ];

      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);

      const result = await caller.summary({ groupBy: "project" });

      expect(result).toHaveLength(1);
      expect(result[0].totalMinutes).toBe(120); // 45 + 75
      expect(result[0].roundedMinutes).toBe(150); // ceil(45/30)*30 + ceil(75/30)*30 = 60 + 90
      // billableAmount = (roundedMinutes / 60) * rate
      expect(result[0].billableAmount).toBe(300); // (150/60) * 120 = 300
    });
  });
});

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
      ctx.db.project.findFirst.mockResolvedValue({ id: "proj_1" });

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
      ctx.db.project.findFirst.mockResolvedValue({ id: "proj_1" });

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
      ctx.db.project.findFirst.mockResolvedValue({ id: "proj_1" });

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

    it("respects organization isolation", async () => {
      const otherOrgCtx = createMockContext({ orgId: "other-org-999" });
      const otherCaller = timeEntriesRouter.createCaller(otherOrgCtx);

      (otherOrgCtx.db as any).timeEntry.findUnique.mockResolvedValue(null);

      await expect(
        otherCaller.delete({ id: "entry_1" })
      ).rejects.toThrow("NOT_FOUND");

      expect((otherOrgCtx.db as any).timeEntry.findUnique).toHaveBeenCalledWith({
        where: { id: "entry_1", organizationId: "other-org-999" },
      });
    });
  });

  describe("billToInvoice", () => {
    it("creates invoice lines from unbilled time entries and updates totals", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
        lines: [],
      };
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
          note: "Dev work",
          invoiceLineId: null,
          task: { id: "task_1", name: "Design", rate: new Decimal(50) },
          project: { id: "proj_1", name: "Website", rate: new Decimal(75) },
        },
        {
          id: "entry_2",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          date: new Date("2026-02-25"),
          minutes: new Decimal(90),
          startTime: null,
          endTime: null,
          note: "Debugging",
          invoiceLineId: null,
          task: null,
          project: { id: "proj_1", name: "Website", rate: new Decimal(75) },
        },
      ];

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);
      ctx.db.tax.findMany.mockResolvedValue([]);

      ctx.db.invoiceLine.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `line_${data.sort}`, ...data })
      );
      ctx.db.timeEntry.update.mockResolvedValue({});
      ctx.db.invoiceLine.findMany.mockResolvedValue([]);
      ctx.db.invoice.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "inv_1", ...data })
      );

      const result = await caller.billToInvoice({
        invoiceId: "inv_1",
        entryIds: ["entry_1", "entry_2"],
      });

      expect(ctx.db.invoice.findUnique).toHaveBeenCalledWith({
        where: { id: "inv_1", organizationId: "test-org-123" },
        include: { lines: true },
      });
      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["entry_1", "entry_2"] },
          organizationId: "test-org-123",
          invoiceLineId: null,
        },
        include: {
          task: { select: { id: true, name: true, rate: true } },
          project: { select: { id: true, name: true, rate: true } },
        },
      });

      // Two invoice lines created
      expect(ctx.db.invoiceLine.create).toHaveBeenCalledTimes(2);

      // First entry: uses task rate (50), minutes=120 -> 2 hours
      expect(ctx.db.invoiceLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sort: 0,
          name: "Design",
          description: "Dev work",
          qty: 2, // 120 min / 60
          rate: 50, // task rate
          invoiceId: "inv_1",
          sourceTable: "TimeEntry",
          sourceId: "entry_1",
        }),
      });

      // Second entry: no task, uses project rate (75), minutes=90 -> 1.5 hours
      expect(ctx.db.invoiceLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sort: 1,
          name: "Website",
          description: "Debugging",
          qty: 1.5, // 90 min / 60
          rate: 75, // project rate
          invoiceId: "inv_1",
          sourceTable: "TimeEntry",
          sourceId: "entry_2",
        }),
      });

      // Entries marked as billed
      expect(ctx.db.timeEntry.update).toHaveBeenCalledTimes(2);

      // Invoice totals recalculated
      expect(ctx.db.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv_1" },
        data: expect.objectContaining({
          subtotal: expect.any(Number),
          taxTotal: expect.any(Number),
          total: expect.any(Number),
        }),
      });
    });

    it("throws NOT_FOUND when invoice doesn't exist", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(
        caller.billToInvoice({
          invoiceId: "nonexistent_inv",
          entryIds: ["entry_1"],
        })
      ).rejects.toThrow("Invoice not found");
    });

    it("throws BAD_REQUEST when no unbilled entries found", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
        lines: [],
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await expect(
        caller.billToInvoice({
          invoiceId: "inv_1",
          entryIds: ["entry_already_billed"],
        })
      ).rejects.toThrow("No unbilled entries found");
    });

    it("starts line sort from existing line count", async () => {
      const existingLines = [
        { id: "line_0", sort: 0 },
        { id: "line_1", sort: 1 },
        { id: "line_2", sort: 2 },
      ];
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
        lines: existingLines,
      };
      const mockEntries = [
        {
          id: "entry_1",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(60),
          note: null,
          invoiceLineId: null,
          task: null,
          project: { id: "proj_1", name: "Project", rate: new Decimal(100) },
        },
      ];

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);
      ctx.db.tax.findMany.mockResolvedValue([]);
      ctx.db.invoiceLine.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `line_${data.sort}`, ...data })
      );
      ctx.db.timeEntry.update.mockResolvedValue({});
      ctx.db.invoiceLine.findMany.mockResolvedValue([]);
      ctx.db.invoice.update.mockResolvedValue({ id: "inv_1" });

      await caller.billToInvoice({
        invoiceId: "inv_1",
        entryIds: ["entry_1"],
      });

      // Sort should start at 3 (existing line count)
      expect(ctx.db.invoiceLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sort: 3,
        }),
      });
    });

    it("uses task name when task exists, project name otherwise", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
        lines: [],
      };
      const mockEntries = [
        {
          id: "entry_with_task",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: "task_1",
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(60),
          note: null,
          invoiceLineId: null,
          task: { id: "task_1", name: "Specific Task", rate: new Decimal(80) },
          project: { id: "proj_1", name: "General Project", rate: new Decimal(50) },
        },
        {
          id: "entry_no_task",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(60),
          note: null,
          invoiceLineId: null,
          task: null,
          project: { id: "proj_1", name: "General Project", rate: new Decimal(50) },
        },
      ];

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);
      ctx.db.tax.findMany.mockResolvedValue([]);
      ctx.db.invoiceLine.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `line_${data.sort}`, ...data })
      );
      ctx.db.timeEntry.update.mockResolvedValue({});
      ctx.db.invoiceLine.findMany.mockResolvedValue([]);
      ctx.db.invoice.update.mockResolvedValue({ id: "inv_1" });

      await caller.billToInvoice({
        invoiceId: "inv_1",
        entryIds: ["entry_with_task", "entry_no_task"],
      });

      // Entry with task uses task name
      expect(ctx.db.invoiceLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Specific Task",
          rate: 80,
        }),
      });

      // Entry without task uses project name
      expect(ctx.db.invoiceLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "General Project",
          rate: 50,
        }),
      });
    });

    it("converts minutes to hours for qty", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
        lines: [],
      };
      const mockEntries = [
        {
          id: "entry_1",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(45),
          note: null,
          invoiceLineId: null,
          task: null,
          project: { id: "proj_1", name: "Project", rate: new Decimal(100) },
        },
      ];

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);
      ctx.db.tax.findMany.mockResolvedValue([]);
      ctx.db.invoiceLine.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "line_0", ...data })
      );
      ctx.db.timeEntry.update.mockResolvedValue({});
      ctx.db.invoiceLine.findMany.mockResolvedValue([]);
      ctx.db.invoice.update.mockResolvedValue({ id: "inv_1" });

      await caller.billToInvoice({
        invoiceId: "inv_1",
        entryIds: ["entry_1"],
      });

      // 45 minutes = 0.75 hours
      expect(ctx.db.invoiceLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          qty: 0.75,
        }),
      });
    });

    it("fetches org taxes for invoice total calculation", async () => {
      const mockInvoice = {
        id: "inv_1",
        organizationId: "test-org-123",
        lines: [],
      };
      const mockEntries = [
        {
          id: "entry_1",
          organizationId: "test-org-123",
          projectId: "proj_1",
          taskId: null,
          userId: "test-user-456",
          date: new Date("2026-02-26"),
          minutes: new Decimal(60),
          note: null,
          invoiceLineId: null,
          task: null,
          project: { id: "proj_1", name: "Project", rate: new Decimal(100) },
        },
      ];

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.timeEntry.findMany.mockResolvedValue(mockEntries);
      ctx.db.tax.findMany.mockResolvedValue([
        { id: "tax_1", rate: new Decimal("13"), isCompound: false },
      ]);
      ctx.db.invoiceLine.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "line_0", ...data })
      );
      ctx.db.timeEntry.update.mockResolvedValue({});
      ctx.db.invoiceLine.findMany.mockResolvedValue([]);
      ctx.db.invoice.update.mockResolvedValue({ id: "inv_1" });

      await caller.billToInvoice({
        invoiceId: "inv_1",
        entryIds: ["entry_1"],
      });

      expect(ctx.db.tax.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123" },
      });
    });
  });
});

import { TRPCError } from "@trpc/server";

describe("timeEntries.create with retainer", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = timeEntriesRouter.createCaller(ctx);
    ctx.db.organization.findFirst.mockResolvedValue({ taskTimeInterval: 0 });
    ctx.db.timeEntry.create.mockImplementation(async ({ data }: any) => ({ id: "te_new", ...data }));
  });

  it("creates BLOCK time entry with no period", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({
      id: "hr_1",
      organizationId: "test-org-123",
      resetInterval: null,
    });

    const te = await caller.create({ retainerId: "hr_1", minutes: 60 });
    expect(te.retainerId).toBe("hr_1");
    expect(te.retainerPeriodId).toBeNull();
    expect(te.projectId).toBeNull();
    expect(ctx.db.hoursRetainerPeriod.findFirst).not.toHaveBeenCalled();
  });

  it("creates MONTHLY time entry auto-attached to the ACTIVE period", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({
      id: "hr_1",
      organizationId: "test-org-123",
      resetInterval: "MONTHLY",
    });
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue({ id: "p_active" });

    const te = await caller.create({ retainerId: "hr_1", minutes: 60 });
    expect(te.retainerPeriodId).toBe("p_active");
  });

  it("throws when MONTHLY retainer has no active period", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({
      id: "hr_1",
      organizationId: "test-org-123",
      resetInterval: "MONTHLY",
    });
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue(null);

    await expect(caller.create({ retainerId: "hr_1", minutes: 60 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/no active period/i),
    });
  });

  it("throws NOT_FOUND when retainer is from another org", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(null);
    await expect(caller.create({ retainerId: "hr_hack", minutes: 30 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("accepts both projectId AND retainerId (retainer time that also counts on the project)", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({
      id: "hr_1",
      organizationId: "test-org-123",
      resetInterval: null,
    });
    ctx.db.project.findFirst.mockResolvedValue({ id: "proj_1" });

    const te = await caller.create({
      projectId: "proj_1",
      retainerId: "hr_1",
      minutes: 60,
    });
    expect(te.projectId).toBe("proj_1");
    expect(te.retainerId).toBe("hr_1");
  });

  it("rejects providing neither", async () => {
    await expect(caller.create({ minutes: 30 })).rejects.toThrow(/at least one/);
  });
});

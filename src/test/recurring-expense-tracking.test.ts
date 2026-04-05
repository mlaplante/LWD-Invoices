import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client-runtime-utils";
import { generateExpensesForRecurring } from "@/server/services/recurring-expense-generator";
import { createMockPrismaClient } from "./mocks/prisma";
import { PrismaClient, RecurringExpense } from "@/generated/prisma";

function makeRecurringExpense(overrides: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    id: "rec-1",
    name: "Monthly Hosting",
    description: null,
    qty: 1,
    rate: new Decimal("29.99"),
    reimbursable: false,
    frequency: "MONTHLY",
    interval: 1,
    startDate: new Date("2026-01-01"),
    nextRunAt: new Date("2026-03-01"),
    endDate: null,
    maxOccurrences: null,
    occurrenceCount: 2,
    isActive: true,
    lastRunDate: null,
    totalGenerated: 2,
    taxId: null,
    categoryId: null,
    supplierId: null,
    projectId: null,
    organizationId: "org-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RecurringExpense;
}

describe("recurring expense generator - tracking, audit, notification", () => {
  let db: PrismaClient;

  beforeEach(() => {
    db = createMockPrismaClient();
    // Setup default mocks
    (db.expense.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "exp-new",
      name: "Monthly Hosting",
    });
    (db.recurringExpense.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.userOrganization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "membership-1",
      userId: "user-owner",
      organizationId: "org-1",
      role: "OWNER",
      user: { id: "user-owner" },
    });
    (db.notification.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("updates lastRunDate and increments totalGenerated", async () => {
    const rec = makeRecurringExpense();
    const now = new Date("2026-03-15");

    await generateExpensesForRecurring(db, rec, now);

    expect(db.recurringExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastRunDate: new Date("2026-03-01"),
          totalGenerated: { increment: 1 },
        }),
      }),
    );
  });

  it("creates audit log entry for each generated expense", async () => {
    const rec = makeRecurringExpense();
    const now = new Date("2026-03-15");

    await generateExpensesForRecurring(db, rec, now);

    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATED",
          entityType: "Expense",
          entityId: "exp-new",
          entityLabel: "Monthly Hosting",
          organizationId: "org-1",
        }),
      }),
    );
  });

  it("creates notification for org owner", async () => {
    const rec = makeRecurringExpense();
    const now = new Date("2026-03-15");

    await generateExpensesForRecurring(db, rec, now);

    expect(db.userOrganization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", role: "OWNER" },
      }),
    );

    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RECURRING_EXPENSE_GENERATED",
          userId: "user-owner",
          organizationId: "org-1",
        }),
      }),
    );
  });

  it("auto-deactivates when next run would exceed endDate", async () => {
    const rec = makeRecurringExpense({
      nextRunAt: new Date("2026-03-01"),
      endDate: new Date("2026-03-15"), // next run after March would be April 1 which exceeds endDate
    });
    const now = new Date("2026-03-10");

    await generateExpensesForRecurring(db, rec, now);

    expect(db.recurringExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
        }),
      }),
    );
  });
});

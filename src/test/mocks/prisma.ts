import { vi } from "vitest";
import { PrismaClient } from "@/generated/prisma";

/**
 * Create a mock Prisma client for testing tRPC procedures
 * Includes mocked methods for all operations used in router tests
 */
export function createMockPrismaClient() {
  const mockClient: any = {
    invoice: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    invoiceLine: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    partialPayment: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    client: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    expense: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
    timeEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    userOrganization: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    projectTask: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    creditNoteApplication: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    invoiceLineTax: {
      findMany: vi.fn(),
    },
    retainer: {
      findMany: vi.fn(),
    },
    recurringExpense: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    recurringInvoice: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    currency: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    item: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    gatewaySetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    attachment: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    comment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    discussion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    discussionReply: {
      create: vi.fn(),
    },
    expenseCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    expenseSupplier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    milestone: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    projectTemplate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    taskStatus: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tax: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    clientPortalSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    ticket: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    ticketMessage: {
      create: vi.fn(),
    },
    timer: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    signatureAuditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    emailAutomation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailAutomationLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    hoursRetainer: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    hoursRetainerPeriod: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  };

  // Mock $queryRaw for raw SQL queries
  mockClient.$queryRaw = vi.fn().mockResolvedValue([]);

  // Mock $transaction to handle both callback and array patterns
  mockClient.$transaction = vi.fn(async (input) => {
    if (typeof input === "function") {
      return await input(mockClient);
    }
    // For array of promises pattern: return the resolved values
    if (Array.isArray(input)) {
      return await Promise.all(input);
    }
    return Promise.resolve([]);
  });

  return mockClient as unknown as PrismaClient;
}

export interface MockTRPCContext {
  db: PrismaClient;
  orgId: string | null;
  userId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userRole: any;
  isActive: boolean | null;
}

/**
 * Create a mock tRPC context for testing procedures
 * Supports overriding any context properties
 */
export function createMockContext(
  overrides?: Partial<MockTRPCContext>,
): MockTRPCContext {
  return {
    db: createMockPrismaClient(),
    orgId: "test-org-123",
    userId: "test-user-456",
    userRole: "OWNER",
    isActive: true,
    ...overrides,
  };
}

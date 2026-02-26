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
    },
    invoiceLine: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    tax: {
      findMany: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    partialPayment: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    client: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    expense: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    expenseCategory: {
      findMany: vi.fn(),
    },
    timeEntry: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    projectTask: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    projectTemplate: {
      findUnique: vi.fn(),
    },
    creditNoteApplication: {
      create: vi.fn(),
    },
  };

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
  orgId: string;
  userId: string;
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
    ...overrides,
  };
}

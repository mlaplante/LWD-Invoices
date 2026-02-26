import { vi } from "vitest";
import { PrismaClient } from "@/generated/prisma";

/**
 * Create a mock Prisma client for testing tRPC procedures
 * Includes mocked methods for all operations used in router tests
 */
export function createMockPrismaClient() {
  return {
    invoice: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    invoiceLine: {
      deleteMany: vi.fn(),
      create: vi.fn(),
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
    $transaction: vi.fn((callback) => {
      // Execute the callback immediately (no actual transaction)
      if (typeof callback === "function") {
        return callback(this);
      }
      return Promise.resolve([]);
    }),
  } as unknown as PrismaClient;
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

/**
 * Re-exports from prisma.ts for convenience
 * Maintains separation of concerns: Prisma mocks in one file, context in another
 */
export { createMockPrismaClient, createMockContext, primeOrgOwnership } from "./prisma";
export type { MockTRPCContext } from "./prisma";

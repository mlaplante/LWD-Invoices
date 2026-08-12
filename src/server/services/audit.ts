import { db } from "../db";
import { AuditAction, Prisma } from "@/generated/prisma";

interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  diff?: Record<string, unknown>;
  userId?: string;
  userLabel?: string;
  organizationId: string;
}

export async function logAudit(input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      ...input,
      diff: input.diff !== undefined
        ? (input.diff as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

export async function logAuditMany(inputs: AuditInput[]): Promise<void> {
  if (inputs.length === 0) return;
  await db.auditLog.createMany({
    data: inputs.map((input) => ({
      ...input,
      diff: input.diff !== undefined
        ? (input.diff as Prisma.InputJsonValue)
        : undefined,
    })),
  });
}

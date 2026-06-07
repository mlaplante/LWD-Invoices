import { z } from "zod";
import { router, requireRole } from "../trpc";
import { idInput } from "../lib/schemas";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@/generated/prisma";
import {
  isNumericField,
  operatorsForField,
} from "../services/automation-engine";
import {
  sendEmailConfigSchema,
  notifyAdminsConfigSchema,
} from "../services/automation-runner";

const TRIGGERS = ["PAYMENT_RECEIVED", "INVOICE_SENT", "INVOICE_VIEWED", "INVOICE_OVERDUE"] as const;
const CONDITION_FIELDS = ["TOTAL", "AMOUNT_DUE", "DAYS_OVERDUE", "STATUS", "CLIENT_NAME", "CURRENCY_CODE"] as const;
const OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAINS", "NOT_CONTAINS"] as const;

const conditionSchema = z
  .object({
    field: z.enum(CONDITION_FIELDS),
    operator: z.enum(OPERATORS),
    value: z.string().min(1).max(200),
    sort: z.number().int().min(0).default(0),
  })
  .superRefine((cond, ctx) => {
    // Reject operator/field mismatches up front (e.g. CONTAINS on a number)
    // so the builder can't persist a rule the engine would silently never fire.
    if (!operatorsForField(cond.field).includes(cond.operator)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Operator ${cond.operator} is not valid for ${cond.field}`,
        path: ["operator"],
      });
    }
    if (isNumericField(cond.field) && !Number.isFinite(Number(cond.value))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${cond.field} requires a numeric value`,
        path: ["value"],
      });
    }
  });

// Discriminated on action type so each config is validated by its own schema.
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SEND_EMAIL"), config: sendEmailConfigSchema, sort: z.number().int().min(0).default(0) }),
  z.object({ type: z.literal("NOTIFY_ADMINS"), config: notifyAdminsConfigSchema, sort: z.number().int().min(0).default(0) }),
]);

const ruleShapeSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: z.enum(TRIGGERS),
  conditionLogic: z.enum(["AND", "OR"]).default("AND"),
  enabled: z.boolean().default(true),
  conditions: z.array(conditionSchema).max(20).default([]),
  actions: z.array(actionSchema).min(1).max(10),
});

type ActionInput = z.infer<typeof actionSchema>;
type ConditionInput = z.infer<typeof conditionSchema>;

function conditionCreate(conditions: ConditionInput[]): Prisma.AutomationConditionCreateWithoutRuleInput[] {
  return conditions.map((c, i) => ({
    field: c.field,
    operator: c.operator,
    value: c.value,
    sort: c.sort ?? i,
  }));
}

function actionCreate(actions: ActionInput[]): Prisma.AutomationActionCreateWithoutRuleInput[] {
  return actions.map((a, i) => ({
    type: a.type,
    config: a.config as Prisma.InputJsonObject,
    sort: a.sort ?? i,
  }));
}

export const automationRulesRouter = router({
  list: requireRole("OWNER", "ADMIN").query(async ({ ctx }) => {
    return ctx.db.automationRule.findMany({
      where: { organizationId: ctx.orgId },
      include: {
        conditions: { orderBy: { sort: "asc" } },
        actions: { orderBy: { sort: "asc" } },
        _count: { select: { runs: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  get: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const rule = await ctx.db.automationRule.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          conditions: { orderBy: { sort: "asc" } },
          actions: { orderBy: { sort: "asc" } },
        },
      });
      if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Automation rule not found" });
      return rule;
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(ruleShapeSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.automationRule.create({
        data: {
          name: input.name,
          trigger: input.trigger,
          conditionLogic: input.conditionLogic,
          enabled: input.enabled,
          organizationId: ctx.orgId,
          conditions: { create: conditionCreate(input.conditions) },
          actions: { create: actionCreate(input.actions) },
        },
        include: { conditions: true, actions: true },
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }).and(ruleShapeSchema))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.automationRule.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Automation rule not found" });

      // Replace conditions/actions wholesale — simplest correct semantics for a
      // builder that submits the full rule on each save.
      return ctx.db.$transaction(async (tx) => {
        await tx.automationCondition.deleteMany({ where: { ruleId: input.id } });
        await tx.automationAction.deleteMany({ where: { ruleId: input.id } });
        return tx.automationRule.update({
          where: { id: input.id, organizationId: ctx.orgId },
          data: {
            name: input.name,
            trigger: input.trigger,
            conditionLogic: input.conditionLogic,
            enabled: input.enabled,
            conditions: { create: conditionCreate(input.conditions) },
            actions: { create: actionCreate(input.actions) },
          },
          include: { conditions: true, actions: true },
        });
      });
    }),

  setEnabled: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.automationRule.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Automation rule not found" });
      return ctx.db.automationRule.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { enabled: input.enabled },
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.automationRule.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Automation rule not found" });
      await ctx.db.automationRule.delete({ where: { id: input.id, organizationId: ctx.orgId } });
      return { success: true };
    }),

  getRuns: requireRole("OWNER", "ADMIN")
    .input(z.object({ ruleId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.automationRun.findMany({
        where: {
          rule: { organizationId: ctx.orgId },
          ...(input?.ruleId ? { ruleId: input.ruleId } : {}),
        },
        include: { invoice: { select: { number: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }),
});

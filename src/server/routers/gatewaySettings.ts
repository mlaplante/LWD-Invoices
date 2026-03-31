import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { GatewayType } from "@/generated/prisma";
import { encryptJson, decryptJson } from "../services/encryption";
import type { StripeConfig, PayPalConfig } from "../services/gateway-config";

const stripeConfigSchema = z.object({
  secretKey: z.string().min(1),
  publishableKey: z.string().min(1),
  webhookSecret: z.string().min(1),
});

const paypalConfigSchema = z.object({
  email: z.string().email(),
});

const manualConfigSchema = z.object({
  instructions: z.string().default(""),
});

export const gatewaySettingsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const gateways = await ctx.db.gatewaySetting.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { gatewayType: "asc" },
    });

    return gateways.map((g) => {
      // Return safe subset — never expose secret keys to the client
      let safeConfig: Record<string, unknown> = {};
      try {
        const decoded = decryptJson<Record<string, unknown>>(g.configJson);
        if (g.gatewayType === GatewayType.STRIPE) {
          const config = decoded as StripeConfig;
          safeConfig = { publishableKey: config.publishableKey };
        } else if (g.gatewayType === GatewayType.PAYPAL) {
          const config = decoded as PayPalConfig;
          safeConfig = { email: config.email };
        } else {
          safeConfig = decoded;
        }
      } catch {
        // configJson not yet set — return empty
      }

      return {
        id: g.id,
        gatewayType: g.gatewayType,
        isEnabled: g.isEnabled,
        surcharge: g.surcharge,
        label: g.label,
        safeConfig,
      };
    });
  }),

  upsert: requireRole("OWNER", "ADMIN")
    .input(
      z.discriminatedUnion("gatewayType", [
        z.object({
          gatewayType: z.literal(GatewayType.STRIPE),
          isEnabled: z.boolean().optional(),
          surcharge: z.number().min(0).max(100).optional(),
          label: z.string().optional(),
          config: stripeConfigSchema,
        }),
        z.object({
          gatewayType: z.literal(GatewayType.PAYPAL),
          isEnabled: z.boolean().optional(),
          surcharge: z.number().min(0).max(100).optional(),
          label: z.string().optional(),
          config: paypalConfigSchema,
        }),
        z.object({
          gatewayType: z.literal(GatewayType.BANK_TRANSFER),
          isEnabled: z.boolean().optional(),
          surcharge: z.number().min(0).max(100).optional(),
          label: z.string().optional(),
          config: manualConfigSchema,
        }),
        z.object({
          gatewayType: z.literal(GatewayType.CASH),
          isEnabled: z.boolean().optional(),
          surcharge: z.number().min(0).max(100).optional(),
          label: z.string().optional(),
          config: manualConfigSchema,
        }),
        z.object({
          gatewayType: z.literal(GatewayType.CHECK),
          isEnabled: z.boolean().optional(),
          surcharge: z.number().min(0).max(100).optional(),
          label: z.string().optional(),
          config: manualConfigSchema,
        }),
        z.object({
          gatewayType: z.literal(GatewayType.MONEY_ORDER),
          isEnabled: z.boolean().optional(),
          surcharge: z.number().min(0).max(100).optional(),
          label: z.string().optional(),
          config: manualConfigSchema,
        }),
      ])
    )
    .mutation(async ({ ctx, input }) => {
      const configJson = encryptJson(input.config);

      return ctx.db.gatewaySetting.upsert({
        where: {
          organizationId_gatewayType: {
            organizationId: ctx.orgId,
            gatewayType: input.gatewayType,
          },
        },
        create: {
          organizationId: ctx.orgId,
          gatewayType: input.gatewayType,
          isEnabled: input.isEnabled ?? false,
          surcharge: input.surcharge ?? 0,
          label: input.label ?? null,
          configJson,
        },
        update: {
          ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
          ...(input.surcharge !== undefined ? { surcharge: input.surcharge } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
          configJson,
        },
      });
    }),

  toggle: requireRole("OWNER", "ADMIN")
    .input(z.object({ gatewayType: z.nativeEnum(GatewayType), isEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.gatewaySetting.findUnique({
        where: {
          organizationId_gatewayType: {
            organizationId: ctx.orgId,
            gatewayType: input.gatewayType,
          },
        },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.gatewaySetting.update({
        where: { id: existing.id },
        data: { isEnabled: input.isEnabled },
      });
    }),
});

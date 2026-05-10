import "server-only";
import { TRPCError } from "@trpc/server";
import { LineType, type PrismaClient } from "@/generated/prisma";
import {
  calculateLineTotals,
  calculateInvoiceTotalsWithDiscount,
  type LineInput,
  type TaxInput,
} from "./tax-calculator";
import {
  computeInvoiceTaxViaStripe,
  type InvoiceDiscount,
} from "./stripe-tax-invoice";
import { missingTaxAddressFields, type TaxAddress } from "./stripe-tax";
import { getStripeClientForOrg } from "./stripe-client";

/**
 * Single entry point both invoice mutation paths (create / update / recurring
 * expansion / credit-note issuance / clone) call to compute line + invoice
 * totals. Branches on org.stripeTaxEnabled:
 *
 * - false (default): legacy calculateLineTotals + calculateInvoiceTotalsWithDiscount
 *   path. Returns legacyTaxBreakdown rows ready to write to InvoiceLineTax.
 *
 * - true: calls Stripe Tax via computeInvoiceTaxViaStripe. Returns
 *   stripeTaxBreakdown rows ready to write to InvoiceLineStripeTaxBreakdown
 *   plus a calculationId to store on Invoice.stripeTaxCalculationId.
 *
 * The two output rows arrays are mutually exclusive: legacy populates one,
 * Stripe populates the other. Caller writes both unconditionally; the empty
 * one creates no rows.
 *
 * Errors:
 * - In Stripe path with discount line types (PERCENTAGE_DISCOUNT /
 *   FIXED_DISCOUNT), throws BAD_REQUEST. Stripe Tax has no notion of
 *   discount line items; use the invoice-level discount instead.
 * - In Stripe path with missing addresses or no Stripe gateway, throws
 *   PRECONDITION_FAILED with the specific gap.
 */

export type ResolverLineInput = {
  // Stable id used to map Stripe response back to its source line. Pass the
  // line's `sort` field stringified — sort is unique within an invoice draft.
  reference: string;
  qty: number;
  rate: number;
  period?: number | null;
  lineType: LineType;
  discount: number;
  discountIsPercentage: boolean;
  taxIds: string[];
  // Optional Stripe Tax product code; defaults to general services.
  stripeTaxCode?: string;
};

export type ResolverInput = {
  db: PrismaClient;
  org: {
    id: string;
    stripeTaxEnabled: boolean;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  clientId: string;
  // Caller passes the invoice's currencyId; resolver only reads the ISO code
  // when the Stripe path is taken, so legacy tests don't need to mock
  // db.currency.findUnique.
  currencyId: string;
  lines: ResolverLineInput[];
  discountType: "percentage" | "fixed" | null;
  discountAmount: number;
  // Tax map for legacy path. Caller already loads this; passed through
  // to avoid a redundant DB hit.
  taxMap: Map<string, TaxInput>;
};

export type ResolvedLine = {
  reference: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  legacyTaxBreakdown: { taxId: string; taxAmount: number }[];
  stripeTaxBreakdown: {
    jurisdictionDisplay: string;
    jurisdictionLevel: string;
    amount: number;
    taxableAmount: number;
    rateDecimal: number;
    taxType: string;
    reason: string | null;
  }[];
};

export type ResolvedInvoice = {
  invoice: {
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    stripeTaxCalculationId: string | null;
  };
  lines: ResolvedLine[];
};

function toLegacyLineInput(line: ResolverLineInput): LineInput {
  return {
    qty: line.qty,
    rate: line.rate,
    period: line.period ?? undefined,
    lineType: line.lineType,
    discount: line.discount,
    discountIsPercentage: line.discountIsPercentage,
    taxIds: line.taxIds,
  };
}

export async function resolveInvoiceTax(input: ResolverInput): Promise<ResolvedInvoice> {
  if (input.org.stripeTaxEnabled) {
    return resolveViaStripe(input);
  }
  return resolveViaLegacy(input);
}

function resolveViaLegacy(input: ResolverInput): ResolvedInvoice {
  const lineResults = input.lines.map((line) => {
    const lineTaxes: TaxInput[] = line.taxIds.flatMap((id) => {
      const tax = input.taxMap.get(id);
      return tax ? [tax] : [];
    });
    const result = calculateLineTotals(toLegacyLineInput(line), lineTaxes);
    return { reference: line.reference, result };
  });

  const invoiceTotals = calculateInvoiceTotalsWithDiscount(
    input.lines.map(toLegacyLineInput),
    [...input.taxMap.values()],
    input.discountType,
    input.discountAmount,
  );

  return {
    invoice: {
      subtotal: invoiceTotals.subtotal,
      discountTotal: invoiceTotals.discountTotal,
      taxTotal: invoiceTotals.taxTotal,
      total: invoiceTotals.total,
      stripeTaxCalculationId: null,
    },
    lines: lineResults.map(({ reference, result }) => ({
      reference,
      subtotal: result.subtotal,
      taxTotal: result.taxTotal,
      total: result.total,
      legacyTaxBreakdown: result.taxBreakdown.map((tb) => ({
        taxId: tb.taxId,
        taxAmount: tb.taxAmount,
      })),
      stripeTaxBreakdown: [],
    })),
  };
}

async function resolveViaStripe(input: ResolverInput): Promise<ResolvedInvoice> {
  // Refuse discount line items: Stripe Tax has no equivalent and we don't want
  // to silently produce wrong tax. Force the user to use invoice-level discount.
  for (const line of input.lines) {
    if (
      line.lineType === LineType.PERCENTAGE_DISCOUNT ||
      line.lineType === LineType.FIXED_DISCOUNT
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Stripe Tax does not support discount line items. Use the invoice-level discount field instead, or disable Stripe Tax.",
      });
    }
  }

  // Compute pre-tax per-line subtotals using the legacy calculator with NO
  // taxes — that gives us subtotal after item-level discount, ignoring tax.
  const lineSubtotals = input.lines.map((line) => {
    const result = calculateLineTotals(toLegacyLineInput(line), []);
    return { reference: line.reference, subtotal: result.subtotal };
  });

  const stripeAccess = await getStripeClientForOrg(input.db, input.org.id);
  if (!stripeAccess) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Stripe Tax is enabled but no active Stripe gateway is configured.",
    });
  }

  const currency = await input.db.currency.findUnique({
    where: { id: input.currencyId },
    select: { code: true },
  });
  if (!currency) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Currency not found" });
  }

  const client = await input.db.client.findUnique({
    where: { id: input.clientId },
    select: {
      address: true,
      city: true,
      state: true,
      zip: true,
      country: true,
      taxId: true,
    },
  });
  if (!client) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
  }

  const origin: Partial<TaxAddress> = {
    line1: input.org.addressLine1 ?? undefined,
    line2: input.org.addressLine2 ?? undefined,
    city: input.org.city ?? undefined,
    state: input.org.state ?? undefined,
    postalCode: input.org.postalCode ?? undefined,
    country: input.org.country ?? undefined,
  };
  const destination: Partial<TaxAddress> = {
    line1: client.address ?? undefined,
    city: client.city ?? undefined,
    state: client.state ?? undefined,
    postalCode: client.zip ?? undefined,
    country: client.country ?? undefined,
  };

  const missing = missingTaxAddressFields({ origin, destination });
  if (missing.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Stripe Tax needs a complete address. Missing: ${missing.join(", ")}.`,
    });
  }

  const discount: InvoiceDiscount =
    input.discountType && input.discountAmount > 0
      ? { type: input.discountType, amount: input.discountAmount }
      : null;

  const stripeResult = await computeInvoiceTaxViaStripe(stripeAccess.stripe, {
    currency: currency.code,
    origin: origin as TaxAddress,
    destination: destination as TaxAddress,
    lines: input.lines.map((line, i) => ({
      reference: line.reference,
      preDiscountSubtotal: lineSubtotals[i].subtotal,
      taxCode: line.stripeTaxCode,
    })),
    discount,
  });

  // Reorder Stripe response to match input order by reference.
  const byRef = new Map(stripeResult.lines.map((l) => [l.reference, l]));

  return {
    invoice: {
      subtotal: stripeResult.subtotal,
      discountTotal: stripeResult.discountTotal,
      taxTotal: stripeResult.taxTotal,
      total: stripeResult.total,
      stripeTaxCalculationId: stripeResult.calculationId,
    },
    lines: input.lines.map((line) => {
      const r = byRef.get(line.reference);
      if (!r) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Stripe Tax did not return a result for line ${line.reference}`,
        });
      }
      return {
        reference: line.reference,
        subtotal: r.subtotal,
        taxTotal: r.taxTotal,
        total: r.total,
        legacyTaxBreakdown: [],
        stripeTaxBreakdown: r.breakdown,
      };
    }),
  };
}

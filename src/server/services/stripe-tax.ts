import "server-only";
import type Stripe from "stripe";

/**
 * Stripe Tax Calculation wrapper.
 *
 * Phase A (current): isolated service used only by an explicit caller. The
 * legacy compound-tax calculator in tax-calculator.ts remains the source of
 * truth for invoice creation/update flows. Wiring this in is Phase B.
 *
 * Stripe Tax requires:
 *   - A Stripe account with at least one Tax Registration (configured via the
 *     Stripe dashboard under Tax → Registrations). Code cannot substitute.
 *   - A complete origin address on the Organization (line1, city, postal_code,
 *     country at minimum; state for US/CA).
 *   - A complete destination address on the Client receiving the invoice.
 *
 * The Calculation API is non-mutating — preview-style. To finalize tax
 * collection (after payment, for tax filing), the calculation is later
 * promoted to a Tax Transaction. That promotion belongs in the webhook /
 * payment-confirmed flow, not here.
 *
 * Reference: https://stripe.com/docs/api/tax/calculations
 */

export type TaxAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
};

export type TaxLineInput = {
  reference: string; // arbitrary id we control (e.g. InvoiceLine.id or sort)
  amount: number; // in major currency unit (dollars), service handles cents conversion
  // Stripe Tax product code. See https://stripe.com/docs/tax/tax-codes
  // Default txcd_99999999 = "General - Services". Pass per-line for accuracy.
  taxCode?: string;
  // "exclusive" (default): tax added on top. "inclusive": amount includes tax.
  taxBehavior?: "exclusive" | "inclusive";
};

export type TaxBreakdownLine = {
  reference: string;
  amount: number;       // pre-tax line amount
  amountTax: number;    // total tax for this line
  breakdowns: Array<{
    jurisdictionDisplay: string;
    jurisdictionLevel: string; // country | state | county | city | district
    amount: number;
    taxableAmount: number;
    rateDecimal: number;       // e.g. 8.25 for 8.25%
    taxType: string;
    reason: string | null;
  }>;
};

export type TaxCalculationResult = {
  calculationId: string;
  totalTax: number;        // sum across lines, in major currency unit
  lines: TaxBreakdownLine[];
};

/**
 * Returns a list of human-readable missing fields, or empty array when ready.
 * Call before attempting calculateInvoiceTax to surface address gaps in the
 * UI rather than getting a Stripe API error.
 */
export function missingTaxAddressFields(input: {
  origin: Partial<TaxAddress>;
  destination: Partial<TaxAddress>;
}): string[] {
  const missing: string[] = [];
  const need: Array<keyof TaxAddress> = ["line1", "city", "postalCode", "country"];

  for (const k of need) {
    if (!input.origin[k]) missing.push(`origin.${k}`);
    if (!input.destination[k]) missing.push(`destination.${k}`);
  }

  // US and CA require state for accurate sales tax / GST.
  if (input.origin.country === "US" || input.origin.country === "CA") {
    if (!input.origin.state) missing.push("origin.state");
  }
  if (input.destination.country === "US" || input.destination.country === "CA") {
    if (!input.destination.state) missing.push("destination.state");
  }

  return missing;
}

const DEFAULT_TAX_CODE = "txcd_99999999";

function toAddress(a: TaxAddress) {
  return {
    line1: a.line1,
    ...(a.line2 ? { line2: a.line2 } : {}),
    city: a.city,
    ...(a.state ? { state: a.state } : {}),
    postal_code: a.postalCode,
    country: a.country,
  };
}

/**
 * Calls Stripe Tax Calculation API. Throws if Stripe rejects (most commonly
 * because Tax Registrations aren't configured for the destination jurisdiction
 * or address validation fails).
 */
export async function calculateInvoiceTax(
  stripe: Stripe,
  args: {
    currency: string; // ISO 4217 lowercase, e.g. "usd"
    origin: TaxAddress;
    destination: TaxAddress;
    customerTaxId?: { type: string; value: string }; // e.g. { type: "eu_vat", value: "DE..." }
    lines: TaxLineInput[];
  }
): Promise<TaxCalculationResult> {
  const calc = await stripe.tax.calculations.create({
    currency: args.currency.toLowerCase(),
    line_items: args.lines.map((l) => ({
      reference: l.reference,
      amount: Math.round(l.amount * 100),
      tax_code: l.taxCode ?? DEFAULT_TAX_CODE,
      tax_behavior: l.taxBehavior ?? "exclusive",
    })),
    customer_details: {
      address: toAddress(args.destination),
      address_source: "billing",
      ...(args.customerTaxId
        ? { tax_ids: [{ type: args.customerTaxId.type as Stripe.TaxIdCreateParams.Type, value: args.customerTaxId.value }] }
        : {}),
    },
    shipping_cost: undefined,
    // Sets the platform's selling location. Stripe uses this with registrations
    // to determine which jurisdictions to tax.
    expand: ["line_items.data.tax_breakdown"],
    // origin is implicit from the Stripe account's tax settings; we don't pass
    // it. Phase B work: validate the org's origin address matches what's
    // configured on the Stripe account.
  });

  if (!calc.id) throw new Error("Stripe Tax calculation returned no id");

  const lines: TaxBreakdownLine[] = (calc.line_items?.data ?? []).map((li) => ({
    reference: li.reference,
    amount: (li.amount ?? 0) / 100,
    amountTax: (li.amount_tax ?? 0) / 100,
    breakdowns: (li.tax_breakdown ?? []).map((b) => ({
      jurisdictionDisplay: b.jurisdiction?.display_name ?? "Unknown",
      jurisdictionLevel: b.jurisdiction?.level ?? "country",
      amount: (b.amount ?? 0) / 100,
      taxableAmount: (b.taxable_amount ?? 0) / 100,
      rateDecimal: parseFloat(b.tax_rate_details?.percentage_decimal ?? "0"),
      taxType: b.tax_rate_details?.tax_type ?? "unknown",
      reason: b.taxability_reason ?? null,
    })),
  }));

  return {
    calculationId: calc.id,
    totalTax: (calc.tax_amount_exclusive ?? 0) / 100,
    lines,
  };
}
